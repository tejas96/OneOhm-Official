import { attendanceDays, type DatabaseExecutor } from '@oneohm/database';
import { isLateCheckIn } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { type Actor, can } from '../../common/auth/actor';
import { saveConditions } from './device-conditions';
import { indiaTime, loadPolicy } from './policy';
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
): Promise<void> {
  await saveConditions(db, {
    userId: actor.userId,
    kind: 'site_check_in',
    subjectId: visitId,
    position: kept,
  });
  await autoCheckIn(db, actor, kept, at);
}

export async function afterSiteCheckOut(
  db: DatabaseExecutor,
  userId: string,
  visitId: string,
  kept: Position | null,
): Promise<void> {
  await saveConditions(db, { userId, kind: 'site_check_out', subjectId: visitId, position: kept });
}

/** Staff who mark attendance only; a day already checked in is left as it is. */
async function autoCheckIn(
  db: DatabaseExecutor,
  actor: Actor,
  kept: Position | null,
  at: Date,
): Promise<void> {
  if (!can(actor, 'attendance.mark')) return;
  const policy = await loadPolicy(db);
  if (!policy.attendance.autoCheckInFromSite) return;
  const [created] = await db
    .insert(attendanceDays)
    .values({
      userId: actor.userId,
      workDate: todayIn('Asia/Kolkata', at),
      checkInAt: at,
      late: isLateCheckIn(
        indiaTime(at),
        policy.attendance.dayStart,
        policy.attendance.graceMinutes,
      ),
      checkInLatitude: kept?.latitude ?? null,
      checkInLongitude: kept?.longitude ?? null,
      checkInAccuracyM: kept?.accuracyM ? Math.round(kept.accuracyM) : null,
      autoFromSite: true,
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
