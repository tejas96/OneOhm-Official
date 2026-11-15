import { Inject, Injectable } from '@nestjs/common';
import type { LocationResult, TeamAttendanceRow } from '@oneohm/api-contracts';
import {
  attendanceDays,
  closeVisitsAtDayEnd,
  locationConsents,
  takeTravelSnapshot,
} from '@oneohm/database';
import { LOCATION_CONSENT_VERSION, nearestLocation } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { conflict } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { resumeDuty } from './attendance-resume';
import { acceptTap, checkInDay, flagDelayedTap } from './attendance-tap';
import { teamAttendance } from './attendance-team';
import { saveConditions } from './device-conditions';
import { isLateAt } from './late-rule';
import { locationResultOf } from './location-result';
import { activeLocations, loadPolicy } from './policy';
import { consentSummary, type Position, readingOutcome } from './tracking';

export type { Position } from './tracking';

/**
 * Check-in and check-out, with the phone's location only when the person has agreed
 * and the policy asks for it (PRD 4.3). No tracking happens in between.
 */
@Injectable()
export class AttendanceService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Consent to the current words only: a change of words asks everyone again. */
  async consented(userId: string) {
    const [row] = await this.db
      .select()
      .from(locationConsents)
      .where(eq(locationConsents.userId, userId))
      .limit(1);
    return consentSummary(row ?? null);
  }

  /**
   * Records yes or no, when, and which version of the words the person read (PRD 4.3).
   * A yes to words other than today's is refused, so the app shows them again.
   */
  async setConsent(actor: Actor, given: boolean, version?: number): Promise<void> {
    if (given && version !== LOCATION_CONSENT_VERSION)
      throw conflict('The location consent has new words. Read them again first.', 'consent_text');
    const now = new Date();
    await this.db
      .insert(locationConsents)
      .values({
        userId: actor.userId,
        consentedAt: given ? now : null,
        withdrawnAt: given ? null : now,
        textVersion: version ?? null,
      })
      .onConflictDoUpdate({
        target: locationConsents.userId,
        set: given
          ? { consentedAt: now, withdrawnAt: null, textVersion: version ?? null }
          : { withdrawnAt: now },
      });
  }

  /**
   * The reading kept for this person now: none without consent to the current words,
   * when the policy is off, or outside working hours. `result` tells the phone what
   * happened, so a reading that was not saved is never silent (live review A5).
   */
  private async usable(actor: Actor, position: Position | null | undefined) {
    const { reading, skipped } = await readingOutcome(this.db, actor.userId, position);
    const match = reading
      ? nearestLocation(reading.position, await activeLocations(this.db))
      : null;
    return {
      reading: reading && { position: reading.position, match },
      result: locationResultOf(skipped, match),
    };
  }

  /**
   * `tappedAt` is the phone's own tap time, for a tap that waited for signal (A9). Within 30
   * minutes it is used as it is; up to 12 hours old it is used but flagged and the manager is
   * told; older, or ahead of the server, it is refused with 422 (see `acceptTap`). The
   * server's receive time is kept beside it.
   */
  async checkIn(
    actor: Actor,
    position: Position | null | undefined,
    tappedAt?: string,
  ): Promise<LocationResult> {
    const received = new Date();
    const tap = await checkInDay(this.db, actor.userId, acceptTap(tappedAt, received), received);
    const now = tap.at;
    const today = tap.workDate;
    const policy = await loadPolicy(this.db);
    const { reading, result } = await this.usable(actor, position);
    await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(attendanceDays)
        .values({
          userId: actor.userId,
          workDate: today,
          checkInAt: now,
          checkInReceivedAt: received,
          late: await isLateAt(tx, policy, now, today),
          checkInLatitude: reading?.position.latitude ?? null,
          checkInLongitude: reading?.position.longitude ?? null,
          checkInAccuracyM: reading?.position.accuracyM
            ? Math.round(reading.position.accuracyM)
            : null,
          checkInLocationId: reading?.match?.location.id ?? null,
          checkInDistanceM: reading?.match?.distanceM ?? null,
          // Null when the accuracy was too poor to tell (see `fenceOf`).
          checkInInside: reading?.match?.inside ?? null,
        })
        .onConflictDoNothing({ target: [attendanceDays.userId, attendanceDays.workDate] })
        .returning({ id: attendanceDays.id });
      if (!created) throw conflict('You have already checked in today.', 'checked_in');
      await saveConditions(tx, {
        userId: actor.userId,
        kind: 'check_in',
        subjectId: created.id,
        position: reading?.position,
      });
      if (tap.delayed)
        await flagDelayedTap(
          tx,
          actor,
          { id: created.id, workDate: today },
          {
            kind: 'check_in',
            at: now,
            received,
          },
        );
    });
    return result;
  }

  /**
   * Ends the person's open day, whatever its date (live review A2): a check-out after
   * midnight closes the day that began yesterday and never starts a new one.
   */
  async checkOut(
    actor: Actor,
    position: Position | null | undefined,
    tappedAt?: string,
  ): Promise<LocationResult> {
    const { reading, result } = await this.usable(actor, position);
    const [open] = await this.db
      .select({
        id: attendanceDays.id,
        workDate: attendanceDays.workDate,
        checkInAt: attendanceDays.checkInAt,
      })
      .from(attendanceDays)
      .where(and(eq(attendanceDays.userId, actor.userId), isNull(attendanceDays.checkOutAt)))
      .orderBy(desc(attendanceDays.workDate))
      .limit(1);
    if (!open) throw conflict('Check in first, or you have already checked out.', 'not_checked_in');
    const received = new Date();
    const { at: outAt, delayed } = acceptTap(tappedAt, received, open.checkInAt);
    // One transaction: the day ends, the person's open site visits end with it (S1) and the
    // day's travel is saved with the rate of the day (S3, S4). A failure leaves the day open.
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(attendanceDays)
        .set({
          checkOutAt: outAt,
          checkOutReceivedAt: received,
          checkOutLatitude: reading?.position.latitude ?? null,
          checkOutLongitude: reading?.position.longitude ?? null,
          checkOutAccuracyM: reading?.position.accuracyM
            ? Math.round(reading.position.accuracyM)
            : null,
          checkOutInside: reading?.match?.inside ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(attendanceDays.id, open.id), isNull(attendanceDays.checkOutAt)))
        .returning({ id: attendanceDays.id });
      if (!updated)
        throw conflict('Check in first, or you have already checked out.', 'not_checked_in');
      if (delayed)
        await flagDelayedTap(
          tx,
          actor,
          { id: open.id, workDate: open.workDate },
          {
            kind: 'check_out',
            at: outAt,
            received,
          },
        );
      await closeVisitsAtDayEnd(tx, actor.userId, outAt);
      await takeTravelSnapshot(tx, actor.userId, open.workDate);
      await saveConditions(tx, {
        userId: actor.userId,
        kind: 'check_out',
        subjectId: updated.id,
        position: reading?.position,
      });
    });
    return result;
  }

  /** Takes back today's End duty (live review A10); see `resumeDuty`. */
  resume(actor: Actor): Promise<void> {
    return resumeDuty(this.db, actor);
  }

  /** Every active staff member on a day: checked in or not, or away on approved leave. */
  team(date = todayIn()): Promise<TeamAttendanceRow[]> {
    return teamAttendance(this.db, date);
  }
}
