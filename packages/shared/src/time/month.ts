import { addDays, todayIn } from './calendar-date';

/**
 * Months for points and reviews, always in India time (`YYYY-MM`), so a point earned
 * just after midnight IST on the 1st belongs to the new month everywhere.
 */
export function monthOf(instant: Date, timeZone = 'Asia/Kolkata'): string {
  return todayIn(timeZone, instant).slice(0, 7);
}

/** First and last calendar day of a `YYYY-MM` month. */
export function monthRange(month: string): { readonly start: string; readonly end: string } {
  const start = `${month}-01`;
  const next = addDays(`${month}-28`, 4).slice(0, 7);
  return { start, end: addDays(`${next}-01`, -1) };
}

export function previousMonth(month: string): string {
  return addDays(`${month}-01`, -1).slice(0, 7);
}
