import { tapQueue } from '../attendance/tap-sender';
import type { DutyFlush } from './duty-queue';
import { dutyQueue, sendDutyPoints } from './duty-sender';
import { FLUSH_AT } from './duty-settings';

/** What a finished upload changed, so the screens can react (see `use-duty-recording`). */
const finished = new Set<(result: DutyFlush) => void>();
export function onDutyFlushed(listener: (result: DutyFlush) => void): () => void {
  finished.add(listener);
  return () => {
    finished.delete(listener);
  };
}

/**
 * Uploads the person's waiting points. Not while a check-in or check-out of theirs still
 * waits for signal: the server would not yet know the day is open, and the points would be
 * turned away. They stay and go once the taps are through.
 */
export async function flushDuty(userId: string): Promise<DutyFlush | null> {
  if (tapQueue.mine(userId).length > 0) return null;
  const result = await dutyQueue.flush(sendDutyPoints, userId);
  for (const listener of finished) listener(result);
  return result;
}

/** Called after points are saved: uploads at once when enough are waiting. */
export async function flushWhenDue(userId: string): Promise<DutyFlush | null> {
  await dutyQueue.load(userId);
  return dutyQueue.waiting(userId) >= FLUSH_AT ? flushDuty(userId) : null;
}

/**
 * The route is uploaded before the day ends, while the server still sees it open. It never
 * holds up the tap for long: with no signal the points wait and go after (the server still
 * takes them for 5 minutes after check-out, and the recorder sends them as soon as it stops).
 */
export async function flushBeforeCheckOut(userId: string): Promise<void> {
  await Promise.race([
    flushDuty(userId).catch(() => null),
    new Promise((resolve) => setTimeout(resolve, 4_000)),
  ]);
}
