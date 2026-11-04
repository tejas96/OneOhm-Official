import { daysBetween, todayIn } from '@oneohm/shared';
import { environmentOnce } from '../../config/environment-once';

/** The business's time zone (India), the same one `today` is read in. */
export const businessZone = () => environmentOnce().BUSINESS_TIMEZONE;

/** The calendar date a moment falls on in the business's time zone, not in UTC. */
export function businessDate(at: Date, timeZone: string = businessZone()): string {
  return todayIn(timeZone, at);
}

/** Whole business days from a moment to `today`; 0 without a moment. */
export function daysSince(
  at: Date | null,
  today: string,
  timeZone: string = businessZone(),
): number {
  return at ? daysBetween(businessDate(at, timeZone), today) : 0;
}
