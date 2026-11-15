import {
  attendanceDays,
  businessTimeZone,
  type DatabaseExecutor,
  delayedTapNotice,
  tellAttendanceTeam,
} from '@oneohm/database';
import { judgeTap } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { unprocessable } from '../../common/http/errors';

/**
 * The time to record for a tap, or a 422 for one that cannot be believed: `tap_too_old`
 * (over 12 hours) or `tap_in_future` (over 2 minutes ahead). See `judgeTap`.
 */
export function acceptTap(
  tappedAt: string | undefined,
  now: Date,
  floor?: Date | null,
): { at: Date; delayed: boolean } {
  const verdict = judgeTap(tappedAt ? new Date(tappedAt) : null, now, floor);
  if (verdict.ok) return { at: verdict.at, delayed: verdict.delayed };
  throw verdict.code === 'tap_too_old'
    ? unprocessable('That tap is too old to record. Ask for a correction.', 'tap_too_old')
    : unprocessable('The time on your phone is ahead of ours. Check your clock.', 'tap_in_future');
}

/**
 * The work date for a check-in tap: the business date of the tap, but never a date that
 * already has a closed day for the person (then the tap is placed at the moment it arrived,
 * on the server's date).
 */
export async function checkInDay(
  db: DatabaseExecutor,
  userId: string,
  tap: { at: Date; delayed: boolean },
  received: Date,
): Promise<{ workDate: string; at: Date; delayed: boolean }> {
  const timeZone = businessTimeZone();
  const workDate = todayIn(timeZone, tap.at);
  const [existing] = await db
    .select({ checkOutAt: attendanceDays.checkOutAt })
    .from(attendanceDays)
    .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, workDate)))
    .limit(1);
  if (existing?.checkOutAt)
    return { workDate: todayIn(timeZone, received), at: received, delayed: false };
  return { workDate, at: tap.at, delayed: tap.delayed };
}

/** Marks the day as having a delayed tap and tells the manager once for that day. */
export async function flagDelayedTap(
  db: DatabaseExecutor,
  actor: Actor,
  day: { id: string; workDate: string },
  tap: { kind: 'check_in' | 'check_out'; at: Date; received: Date },
): Promise<void> {
  await db.update(attendanceDays).set({ tapDelayed: true }).where(eq(attendanceDays.id, day.id));
  await tellAttendanceTeam(
    db,
    actor.userId,
    delayedTapNotice(
      {
        dayId: day.id,
        workDate: day.workDate,
        kind: tap.kind,
        tappedAt: tap.at,
        receivedAt: tap.received,
        timeZone: businessTimeZone(),
      },
      actor.fullName,
    ),
  );
}
