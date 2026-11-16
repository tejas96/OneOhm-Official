import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DutyPointInput, DutyPointsResult } from '@oneohm/api-contracts';
import { attendanceDays, businessTimeZone, dutyPoints, takeTravelSnapshot } from '@oneohm/database';
import { DUTY_SKEW_MS, type DutyPointRejection, judgeDutyPoint } from '@oneohm/domain';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { DATABASE, type Database } from '../../config/core.module';
import { RouteVisitsService } from '../site-activity/route-visits.service';
import { alertsAfterPoints } from './duty-point-alerts';
import { trackingFor } from './tracking';

/**
 * Route points from the phone while the person is on duty (Duty Day step 1). Each point is
 * judged on its own by `judgeDutyPoint`; a rejected one never blocks the rest of the batch.
 * Points of a day that is already closed (a late flush, within the rule) are stored, and the
 * day's saved travel and any waiting claim are worked out again (`remeasureClosedDays`).
 */
const DAY_LOOKBACK_MS = 48 * 3_600_000;

@Injectable()
export class DutyPointsService {
  private readonly log = new Logger('DutyPoints');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly routeVisits: RouteVisitsService,
  ) {}

  /**
   * Points that reached a day already closed (a late flush) change its km, so the day's saved
   * travel is measured again; a claim still waiting takes the new amount, an approved or paid
   * one is never changed (`settleDayClaim`). Together with the claim, in one transaction.
   */
  private async remeasureClosedDays(
    userId: string,
    kept: readonly { attendanceDayId: string }[],
    days: readonly { id: string; workDate: string; checkOutAt: Date | null }[],
  ): Promise<void> {
    const ids = new Set(kept.map((point) => point.attendanceDayId));
    for (const day of days)
      if (ids.has(day.id) && day.checkOutAt)
        await this.db.transaction((tx) => takeTravelSnapshot(tx, userId, day.workDate));
  }

  async upload(actor: Actor, points: readonly DutyPointInput[]): Promise<DutyPointsResult> {
    const now = new Date();
    const { status, switchedOn } = await trackingFor(this.db, actor.userId, now);
    const consentedAt = status.consentAt ? new Date(status.consentAt) : null;
    const consentGiven = status.state !== 'no_consent' && status.state !== 'policy_off';
    const timeZone = businessTimeZone();
    const times = points.map((point) => new Date(point.recordedAt).getTime());
    const [known, days] = await Promise.all([
      this.db
        .select({ id: dutyPoints.id })
        .from(dutyPoints)
        .where(
          and(
            eq(dutyPoints.userId, actor.userId),
            inArray(
              dutyPoints.id,
              points.map((point) => point.id),
            ),
          ),
        ),
      this.db
        .select({
          id: attendanceDays.id,
          workDate: attendanceDays.workDate,
          checkInAt: attendanceDays.checkInAt,
          checkOutAt: attendanceDays.checkOutAt,
        })
        .from(attendanceDays)
        .where(
          and(
            eq(attendanceDays.userId, actor.userId),
            lte(attendanceDays.checkInAt, new Date(Math.max(...times) + DUTY_SKEW_MS)),
            // A day that began earlier than this cannot take a point (open days are capped
            // 6 hours after their work date). Closed days in range stay, so that a later
            // closed day still wins over an older day that was never closed.
            gte(attendanceDays.checkInAt, new Date(Math.min(...times) - DAY_LOOKBACK_MS)),
          ),
        )
        .orderBy(asc(attendanceDays.checkInAt)),
    ]);
    const seen = new Set(known.map((row) => row.id));
    const keep: (typeof dutyPoints.$inferInsert)[] = [];
    const rejected: { id: string; reason: DutyPointRejection }[] = [];
    let accepted = 0;
    for (const point of points) {
      const verdict = judgeDutyPoint({
        recordedAt: new Date(point.recordedAt),
        latitude: point.latitude,
        longitude: point.longitude,
        now,
        switchedOn,
        consentGiven,
        consentedAt,
        days,
        timeZone,
        // Also a repeat inside this one batch.
        duplicate: seen.has(point.id),
      });
      if (!verdict.accepted) {
        rejected.push({ id: point.id, reason: verdict.reason });
        continue;
      }
      accepted += 1;
      seen.add(point.id);
      if (verdict.dayId)
        keep.push({
          id: point.id,
          userId: actor.userId,
          attendanceDayId: verdict.dayId,
          recordedAt: new Date(point.recordedAt),
          latitude: point.latitude,
          longitude: point.longitude,
          accuracyM: point.accuracyM ?? null,
          speedMps: point.speedMps ?? null,
          headingDeg: point.headingDeg ?? null,
          altitudeM: point.altitudeM ?? null,
          mocked: point.mocked,
          batteryPercent: point.batteryPercent ?? null,
          charging: point.charging ?? null,
          network: point.network ?? null,
          receivedAt: now,
        });
    }
    // A point that raced in from a second upload hits the (person, id) key and is skipped.
    if (keep.length) {
      await this.db.insert(dutyPoints).values(keep).onConflictDoNothing();
      await this.remeasureClosedDays(actor.userId, keep, days);
      // The route may show an arrival or a departure the phone's fence missed (Duty Day step 3).
      await this.routeVisits.afterPoints(actor, now);
      // Fake GPS, a route gap, an unknown stop, and late points for a closed visit's proof
      // (Duty Day step 5). The points are saved either way: a fault here never fails the upload.
      try {
        const tracking = { on: status.state === 'on', consentedAt };
        await alertsAfterPoints(this.db, actor, keep, days, tracking, now, timeZone);
      } catch (error) {
        this.log.error(`Duty alerts after points failed for ${actor.userId}`, error);
      }
    }
    return { accepted, rejected };
  }
}
