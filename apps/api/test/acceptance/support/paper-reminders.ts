import { queuePaperReminders } from '../../../../worker/src/activities/paper-reminders';
import { acceptanceDb } from './db';

/** A fixed-offset zone `ahead` hours from UTC (Etc/GMT signs are reversed). */
function offsetZone(ahead: number): string {
  return ahead === 0 ? 'Etc/GMT' : `Etc/GMT${ahead > 0 ? '-' : '+'}${Math.abs(ahead)}`;
}

const weekdayIn = (now: Date, zone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short' }).format(now);

/**
 * A fixed-offset time zone where it is `hour` o'clock at `now`, on a day that is not a
 * Sunday when one exists (Sunday is closed, redesign §14). For a working hour, other
 * hours of the working day (10–17) are tried before falling back to `hour` as asked.
 */
export function zoneAt(now: Date, hour: number): string {
  const hours = hour >= 10 && hour <= 17 ? [hour, 10, 11, 12, 13, 14, 15, 16, 17] : [hour];
  for (const at of hours) {
    const base = (at - now.getUTCHours() + 24) % 24;
    for (const ahead of [base, base - 24])
      if (ahead >= -12 && ahead <= 14) {
        const zone = offsetZone(ahead);
        if (weekdayIn(now, zone) !== 'Sun') return zone;
      }
  }
  const ahead = (hour - now.getUTCHours() + 24) % 24;
  return offsetZone(ahead > 14 ? ahead - 24 : ahead);
}

/**
 * The worker's paper reminders run once by hand at a chosen clock (the timer is off here),
 * by default in a time zone where it is midday, so customer reminders are in working hours.
 */
export const runPaperReminders = (now = new Date(), timeZone = zoneAt(now, 12)) =>
  queuePaperReminders(acceptanceDb().db, now, timeZone);
