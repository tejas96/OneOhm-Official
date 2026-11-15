import { timeReached } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { businessClock } from '../timed-reminders';

/** How often a job really runs: every 15-minute tick, about hourly, or once a business day. */
export type Cadence = 'every' | 'hourly' | 'daily';

/** An hourly job runs again once its last run is at least this old (a little under an hour). */
export const HOURLY_GAP_MS = 55 * 60_000;

/** The business time after which the daily jobs run. */
export const DAILY_FROM = '09:00';

/** Whether a job is due now, from when it last ran (null: never). */
export function isDue(
  cadence: Cadence,
  lastRanAt: Date | null,
  now: Date,
  timeZone: string,
): boolean {
  if (cadence === 'every') return true;
  if (cadence === 'hourly')
    return !lastRanAt || now.getTime() - lastRanAt.getTime() >= HOURLY_GAP_MS;
  if (!timeReached(DAILY_FROM, businessClock(timeZone, now).clock)) return false;
  return !lastRanAt || todayIn(timeZone, lastRanAt) !== todayIn(timeZone, now);
}
