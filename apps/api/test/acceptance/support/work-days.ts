import { CALL_DAY_WORDS, callDay } from '@oneohm/domain';
import { addDays } from './sales';

/**
 * Clocks for the scenarios, by the same working-time rule the API uses (`callDay`:
 * Monday–Saturday 9:30–6:30, Sunday closed), so no scenario depends on the day or hour
 * the suite runs.
 */
const ZONE = 'Asia/Kolkata';

/** The business day (YYYY-MM-DD) of a moment, in India. */
export const dayIn = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(at);

/** 0 for Sunday … 6 for Saturday, for a YYYY-MM-DD day. */
export const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/**
 * What "Call me back" promises at `now` (the API's own `callDay`): today in working hours,
 * else the next working morning — Monday after Saturday evening or on Sunday.
 */
export function promisedCall(now = new Date()): { day: string; when: string } {
  const call = callDay(now, ZONE);
  return { day: addDays(dayIn(now), call.add), when: CALL_DAY_WORDS[call.day] };
}

/**
 * The first day after today that is Monday to Friday: its evening is followed by a working
 * morning (not Sunday). For scenarios whose taps must be newer than the chat's last message.
 */
export function nextWeekday(from = dayIn(new Date())): string {
  let day = addDays(from, 1);
  while (weekdayOf(day) === 0 || weekdayOf(day) === 6) day = addDays(day, 1);
  return day;
}

/** The latest past Monday-to-Friday at least `days` before today, for clocks in the past. */
export function pastWeekday(days = 1, from = dayIn(new Date())): string {
  let day = addDays(from, -days);
  while (weekdayOf(day) === 0 || weekdayOf(day) === 6) day = addDays(day, -1);
  return day;
}
