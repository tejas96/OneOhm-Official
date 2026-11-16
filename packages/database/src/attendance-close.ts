import { autoCloseAt } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { autoClosedNotice } from './attendance-notices';
import { tellAttendanceTeam } from './attendance-team-notice';
import { businessTimeZone } from './business-calendar';
import type { Database } from './client';
import { notify } from './notify';
import { users } from './schema/identity.schema';
import { siteVisits } from './schema/site-activity.schema';
import { attendanceDays } from './schema/workforce.schema';
import { closeStaleVisits, closeVisitsAtDayEnd } from './site-visit-close';
import { takeTravelSnapshot } from './travel-snapshot';

/** Only days this recent are announced; older forgotten days are closed without notices. */
export const AUTO_CLOSE_NOTICE_DAYS = 7;

export interface AutoCloseResult {
  /** Days closed with notices (the work date is within the last 7 days). */
  readonly closed: number;
  /** Older days closed quietly: flagged `auto_closed_at`, nobody told. */
  readonly quiet: number;
  /** Open site visits of an earlier day that were closed at that day's end. */
  readonly visits: number;
}

/**
 * Ends every day from before `today` that has a check-in and no check-out (live review
 * A1), at the person's last known activity: the check-in or a site visit's check-in or
 * check-out that day, never past the day's end. Open site visits end with it and its travel
 * is saved (live review S1, S4). The day is flagged (`auto_closed_at`) and, for a work date
 * within the last 7 days, the person and their manager (or whoever approves corrections)
 * are told. Older days are closed quietly, with no notices. Each day's close, visit close,
 * travel snapshot and notices are one transaction, so a failure leaves that day untouched
 * and a retry finds it open. A day already ended (by the person, or by an earlier run) is
 * skipped, so running again is safe. Last, any site visit left open from an earlier day is
 * closed at the end of its own day, even when that day's attendance is already closed.
 */
export async function closeForgottenDays(
  db: Database,
  today: string,
  timeZone: string = businessTimeZone(),
  now: Date = new Date(),
): Promise<AutoCloseResult> {
  const noticeFrom = addDays(today, -AUTO_CLOSE_NOTICE_DAYS);
  const open = await db
    .select({
      id: attendanceDays.id,
      userId: attendanceDays.userId,
      workDate: attendanceDays.workDate,
      checkInAt: attendanceDays.checkInAt,
      fullName: users.fullName,
    })
    .from(attendanceDays)
    .innerJoin(users, eq(users.id, attendanceDays.userId))
    .where(and(isNull(attendanceDays.checkOutAt), lt(attendanceDays.workDate, today)));
  let closed = 0;
  let quiet = 0;
  for (const day of open) {
    const announce = day.workDate >= noticeFrom;
    const done = await db.transaction(async (tx) => {
      const visits = await tx
        .select({ checkInAt: siteVisits.checkInAt, checkOutAt: siteVisits.checkOutAt })
        .from(siteVisits)
        .where(and(eq(siteVisits.userId, day.userId), eq(siteVisits.workDate, day.workDate)));
      const closedAt = autoCloseAt({
        workDate: day.workDate,
        checkInAt: day.checkInAt,
        activity: visits.flatMap((visit) => [visit.checkInAt, visit.checkOutAt]),
        timeZone,
      });
      const [row] = await tx
        .update(attendanceDays)
        .set({ checkOutAt: closedAt, autoClosedAt: now, updatedAt: now })
        .where(and(eq(attendanceDays.id, day.id), isNull(attendanceDays.checkOutAt)))
        .returning({ id: attendanceDays.id });
      if (!row) return false;
      // The person's open site visits end with the day, then the day's travel is saved.
      await closeVisitsAtDayEnd(tx, day.userId, closedAt, closedAt);
      await takeTravelSnapshot(tx, day.userId, day.workDate, now);
      if (announce) {
        const facts = { dayId: day.id, workDate: day.workDate, closedAt, timeZone };
        await notify(tx, { userId: day.userId }, autoClosedNotice('self', facts, day.fullName));
        await tellAttendanceTeam(tx, day.userId, autoClosedNotice('team', facts, day.fullName));
      }
      return true;
    });
    if (!done) continue;
    if (announce) closed += 1;
    else quiet += 1;
  }
  const visits = await closeStaleVisits(db, today, timeZone, now);
  return { closed, quiet, visits };
}
