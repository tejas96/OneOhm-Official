export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

/** "Tue, 4 Nov" for a calendar date (YYYY-MM-DD). */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "4 November 2026" for a calendar date. */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "4 Nov 2026" for a moment in time, in India. */
export function momentDate(instant: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(instant));
}

/** "Saturday, 1 November" for the top of Home. */
export function longToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(now);
}
