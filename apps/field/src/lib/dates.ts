import { addDays, daysBetween, todayIn } from '@oneohm/shared';

export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

/** Today's calendar date (YYYY-MM-DD) where OneOhm works. */
export function businessToday(): string {
  return todayIn(BUSINESS_TIME_ZONE);
}

/** "Tue, 4 Nov" for a calendar date. */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "Today", "Tomorrow", "Yesterday" or the short date. */
export function relativeDate(date: string, today = businessToday()): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return shortDate(date);
}

/** "Saturday, 1 November" for the header of the day. */
export function longToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(now);
}

/** "12 Oct, 4:30 pm" for a moment in time. */
export function shortMoment(instant: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(instant));
}

export { addDays, daysBetween };

/** "9:42 am" in India time for an instant. */
export function clockTime(instant: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(instant));
}
