import { Inject, Injectable } from '@nestjs/common';
import type { TeamAttendanceRow } from '@oneohm/api-contracts';
import {
  attendanceDays,
  leaveRequests,
  locationConsents,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import { isLateCheckIn, LOCATION_CONSENT_VERSION, nearestLocation } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { conflict } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { activeLocations, indiaTime, loadPolicy } from './policy';
import { consentSummary, type Position, usableReading } from './tracking';
import { readDays } from './workforce-read';

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
   * when the policy is off, or outside working hours.
   */
  private async usable(actor: Actor, position: Position | null | undefined) {
    const reading = await usableReading(this.db, actor.userId, position);
    if (!reading) return null;
    const match = nearestLocation(reading.position, await activeLocations(this.db));
    return { position: reading.position, match, policy: reading.policy };
  }

  async checkIn(actor: Actor, position: Position | null | undefined): Promise<void> {
    const today = todayIn();
    const now = new Date();
    const policy = await loadPolicy(this.db);
    const reading = await this.usable(actor, position);
    const [created] = await this.db
      .insert(attendanceDays)
      .values({
        userId: actor.userId,
        workDate: today,
        checkInAt: now,
        late: isLateCheckIn(
          indiaTime(now),
          policy.attendance.dayStart,
          policy.attendance.graceMinutes,
        ),
        checkInLatitude: reading?.position.latitude ?? null,
        checkInLongitude: reading?.position.longitude ?? null,
        checkInAccuracyM: reading?.position.accuracyM
          ? Math.round(reading.position.accuracyM)
          : null,
        checkInLocationId: reading?.match?.location.id ?? null,
        checkInDistanceM: reading?.match?.distanceM ?? null,
        checkInInside: reading?.match?.inside ?? null,
      })
      .onConflictDoNothing({ target: [attendanceDays.userId, attendanceDays.workDate] })
      .returning({ id: attendanceDays.id });
    if (!created) throw conflict('You have already checked in today.', 'checked_in');
  }

  async checkOut(actor: Actor, position: Position | null | undefined): Promise<void> {
    const reading = await this.usable(actor, position);
    const [updated] = await this.db
      .update(attendanceDays)
      .set({
        checkOutAt: new Date(),
        checkOutLatitude: reading?.position.latitude ?? null,
        checkOutLongitude: reading?.position.longitude ?? null,
        checkOutAccuracyM: reading?.position.accuracyM
          ? Math.round(reading.position.accuracyM)
          : null,
        checkOutInside: reading?.match?.inside ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(attendanceDays.userId, actor.userId),
          eq(attendanceDays.workDate, todayIn()),
          isNull(attendanceDays.checkOutAt),
        ),
      )
      .returning({ id: attendanceDays.id });
    if (!updated)
      throw conflict('Check in first, or you have already checked out.', 'not_checked_in');
  }

  /** Every active staff member on a day: checked in or not, or away on approved leave. */
  async team(date = todayIn()): Promise<TeamAttendanceRow[]> {
    const people = await this.db
      .selectDistinct({ id: users.id, fullName: users.fullName })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
      .where(eq(users.status, 'active'))
      .orderBy(asc(users.fullName));
    const ids = people.map((person) => person.id);
    const [days, away] = await Promise.all([
      readDays(this.db, date, ids),
      ids.length
        ? this.db
            .select({ userId: leaveRequests.userId, leaveType: leaveRequests.leaveType })
            .from(leaveRequests)
            .where(
              and(
                inArray(leaveRequests.userId, ids),
                eq(leaveRequests.status, 'approved'),
                lte(leaveRequests.fromDate, date),
                gte(leaveRequests.toDate, date),
              ),
            )
        : Promise.resolve([]),
    ]);
    const policy = await loadPolicy(this.db);
    return people.map((person) => {
      const leave = away.find((row) => row.userId === person.id);
      return {
        user: person,
        day: days.get(person.id) ?? null,
        onLeave: leave
          ? (policy.leaveTypes.find((type) => type.key === leave.leaveType)?.label ??
            leave.leaveType)
          : null,
      };
    });
  }
}
