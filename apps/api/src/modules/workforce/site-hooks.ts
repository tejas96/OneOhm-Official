import { attendanceDays, type DatabaseExecutor, settleVisitProof } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { currentCalendar } from '../../common/calendar';
import { conflict } from '../../common/http/errors';
import { saveConditions } from './device-conditions';
import { isLateAt } from './late-rule';
import { loadPolicy } from './policy';
import type { Position } from './tracking';

/**
 * Called by the site and service check-ins with the reading they kept (or null).
 * Keeps the phone's battery and connection with it, and, when the policy says so, makes
 * the day's first site check-in the person's attendance check-in too (PRD 4.3).
 */
export async function afterSiteCheckIn(
  db: DatabaseExecutor,
  actor: Actor,
  visitId: string,
  kept: Position | null,
  at: Date = new Date(),
  /** The check-in is an automatic one that reached the server late. */
  delayed = false,
): Promise<void> {
  await saveConditions(db, {
    userId: actor.userId,
    kind: 'site_check_in',
    subjectId: visitId,
    position: kept,
  });
  await autoCheckIn(db, actor, kept, at, delayed);
}

/**
 * A person who ended their day cannot check in at a site that same day (live review S1):
 * the visit would run after the day's end and be closed or missed by the night job. They
 * resume duty first. The day row is locked so an End duty cannot slip in between.
 */
export async function assertDayNotClosed(
  db: DatabaseExecutor,
  userId: string,
  workDate: string,
): Promise<void> {
  const [day] = await db
    .select({ checkOutAt: attendanceDays.checkOutAt })
    .from(attendanceDays)
    .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, workDate)))
    .for('update')
    .limit(1);
  if (day?.checkOutAt) throw conflict('You ended your day. Resume duty to check in.', 'day_closed');
}

/**
 * Called by every check-out (a tap, the fence, the route, the task finishing, a service
 * visit) once the visit is closed: keeps the phone's battery and connection, and works out
 * the visit's proof (Duty Day step 5), raising `visit_doubtful` when it is doubtful.
 */
export async function afterSiteCheckOut(
  db: DatabaseExecutor,
  userId: string,
  visitId: string,
  kept: Position | null,
): Promise<void> {
  await saveConditions(db, { userId, kind: 'site_check_out', subjectId: visitId, position: kept });
  await settleVisitProof(db, visitId);
}

/** Staff who mark attendance only; a day already checked in is left as it is. */
async function autoCheckIn(
  db: DatabaseExecutor,
  actor: Actor,
  kept: Position | null,
  at: Date,
  delayed: boolean,
): Promise<void> {
  if (!can(actor, 'attendance.mark')) return;
  const policy = await loadPolicy(db);
  if (!policy.attendance.autoCheckInFromSite) return;
  const [created] = await db
    .insert(attendanceDays)
    .values({
      userId: actor.userId,
      workDate: todayIn(currentCalendar().timeZone, at),
      checkInAt: at,
      late: await isLateAt(db, policy, at),
      checkInLatitude: kept?.latitude ?? null,
      checkInLongitude: kept?.longitude ?? null,
      checkInAccuracyM: kept?.accuracyM ? Math.round(kept.accuracyM) : null,
      autoFromSite: true,
      tapDelayed: delayed,
    })
    .onConflictDoNothing({ target: [attendanceDays.userId, attendanceDays.workDate] })
    .returning({ id: attendanceDays.id });
  if (created)
    await saveConditions(db, {
      userId: actor.userId,
      kind: 'check_in',
      subjectId: created.id,
      position: kept,
    });
}
