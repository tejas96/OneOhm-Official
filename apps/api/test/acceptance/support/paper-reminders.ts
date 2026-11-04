import { queuePaperReminders } from '../../../../worker/src/activities/paper-reminders';
import { acceptanceDb } from './db';

/** A fixed-offset time zone where it is `hour` o'clock at `now` (Etc/GMT signs are reversed). */
export function zoneAt(now: Date, hour: number): string {
  let ahead = (hour - now.getUTCHours() + 24) % 24;
  if (ahead > 14) ahead -= 24;
  return ahead === 0 ? 'Etc/GMT' : `Etc/GMT${ahead > 0 ? '-' : '+'}${Math.abs(ahead)}`;
}

/**
 * The worker's paper reminders run once by hand at a chosen clock (the timer is off here),
 * by default in a time zone where it is midday, so customer reminders are in working hours.
 */
export const runPaperReminders = (now = new Date(), timeZone = zoneAt(now, 12)) =>
  queuePaperReminders(acceptanceDb().db, now, timeZone);
