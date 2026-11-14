import { addDays, daysBetween } from '@oneohm/shared';
import {
  type BusinessCalendar,
  clockAt,
  DEFAULT_CALENDAR,
  isWorkingDay,
  isWorkingTime,
  nextWorkingDay,
  previousWorkingDay,
  weekdayOf,
  zonedInstant,
} from '../calendar/business-calendar';
import { WEEKDAY_NAMES } from '../calendar/hours-text';

/**
 * WhatsApp chat rules shared by the API and the worker: the working clock and who answers.
 * The working hours are the business calendar's (Settings → Working time & holidays).
 */

/** After this long the person answering is nudged; after LATE_MIN the desk is told. */
export const FIRST_NUDGE_MIN = 30;
export const LATE_MIN = 120;
/** A chat nobody on the team has written in for this long goes back to the assistant. */
export const HAND_BACK_MIN = 240;

/**
 * Meta accepts chat messages (not templates) for 24 hours after the customer last wrote.
 * OneOhm stops an hour early, so a message queued or retried late never reaches a closed
 * chat. The API (choosing chat or template) and the worker (at send time) share this.
 */
export const CHAT_WINDOW_HOURS = 23;

/** Whether a chat message can still go to this customer now. */
export function chatWindowOpen(lastInboundAt: Date | null | undefined, now = new Date()): boolean {
  return (
    lastInboundAt != null && now.getTime() - lastInboundAt.getTime() < CHAT_WINDOW_HOURS * 3_600_000
  );
}

/**
 * When the office next opens from `now`: today if it is a working day not yet open, else the
 * next working day. `add` is the days from today, `weekday` that day's weekday (0 Sunday).
 */
export function nextOpening(now: Date, cal: BusinessCalendar = DEFAULT_CALENDAR) {
  const { day, minute } = clockAt(now, cal.timeZone);
  if (isWorkingDay(day, cal) && minute < cal.startMin)
    return { add: 0, day, weekday: weekdayOf(day) };
  const next = nextWorkingDay(day, cal);
  return { add: daysBetween(day, next), day: next, weekday: weekdayOf(next) };
}

/**
 * When a person can reply, as the customer is told: `now` in working hours, else the
 * morning it opens again: today, tomorrow, or `later` (a named weekday, such as Monday
 * after a Saturday evening or the day after a holiday).
 */
export type ReplyTime = 'now' | 'today' | 'tomorrow' | 'later';

export function replyTime(now: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): ReplyTime {
  if (isWorkingTime(now, cal)) return 'now';
  const { add } = nextOpening(now, cal);
  return add === 0 ? 'today' : add === 1 ? 'tomorrow' : 'later';
}

/** The day a promised call is due: today, the next working day, or a later named weekday. */
export type CallDay = 'today' | 'tomorrow' | 'later';

/** How a promised call's day is said (the English words; the staff history uses them). */
export function callDayWords(call: { day: CallDay; weekday: number }): string {
  if (call.day === 'today') return 'today';
  if (call.day === 'tomorrow') return 'tomorrow morning';
  return `on ${WEEKDAY_NAMES.en[call.weekday]} morning`;
}

/**
 * When a call promised at `now` is due, by the same clock as `replyTime`: today in working
 * hours (or before opening on a working day), else the next working morning, with the days
 * to add to today and that day's weekday.
 */
export function callDay(
  now: Date,
  cal: BusinessCalendar = DEFAULT_CALENDAR,
): { day: CallDay; add: number; weekday: number } {
  const time = replyTime(now, cal);
  const { add, weekday } = nextOpening(now, cal);
  if (time === 'now') return { day: 'today', add: 0, weekday: clockAt(now, cal.timeZone).weekday };
  return { day: time, add, weekday };
}

/**
 * When working hours last ended: closing time today once it is past, else closing time on the
 * working day before. A weekly day off or holiday has no closing time.
 */
export function lastWorkEnd(now: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): Date {
  const { day, minute } = clockAt(now, cal.timeZone);
  const today = isWorkingDay(day, cal) && minute >= cal.endMin;
  return zonedInstant(today ? day : previousWorkingDay(day, cal), cal.endMin, cal.timeZone);
}

/**
 * Working minutes since `from`, on the working clock: it starts when `from` happened, or
 * at opening time for anything earlier; 0 outside working hours.
 */
export function workingMinutesSince(
  from: Date,
  now: Date,
  cal: BusinessCalendar = DEFAULT_CALENDAR,
): number {
  if (!isWorkingTime(now, cal)) return 0;
  const { day } = clockAt(now, cal.timeZone);
  const dayStart = zonedInstant(day, cal.startMin, cal.timeZone);
  const start = from > dayStart ? from : dayStart;
  return Math.max(0, (now.getTime() - start.getTime()) / 60_000);
}

/**
 * How late an answer is, in working minutes: the clock starts when the customer wrote,
 * or at opening time for a message sent overnight. 1 nudges the person answering,
 * 2 is late (the desk is told); null is not yet, or outside working hours.
 */
export function chatWaitStage(
  lastInAt: Date,
  now: Date,
  cal: BusinessCalendar = DEFAULT_CALENDAR,
): 1 | 2 | null {
  const minutes = workingMinutesSince(lastInAt, now, cal);
  if (minutes >= LATE_MIN) return 2;
  if (minutes >= FIRST_NUDGE_MIN) return 1;
  return null;
}

/** The chat's owner answers; an owner who is away or gone hands to their backup, else the desk. */
export function pickAnswerer(input: {
  readonly owner: string | null;
  readonly ownerActive: boolean;
  readonly backupToday: string | null;
}): string | null {
  if (!input.owner) return null;
  if (input.ownerActive) return input.owner;
  return input.backupToday;
}

/**
 * The customer a family member's number belongs to, only when it is exactly one: a
 * number on two customers' lists is treated as a stranger, so nobody sees the wrong
 * customer's payments or papers.
 */
export function soleCustomer<T extends { readonly id: string }>(rows: readonly T[]): T | null {
  const ids = new Set(rows.map((row) => row.id));
  return ids.size === 1 ? (rows[0] ?? null) : null;
}

/**
 * Working minutes between two moments on the working clock (working days, opening to
 * closing; days off and holidays never count). A staff check "after 1 working day" is
 * `openMinutes(cal)` of these, so an answer late on the last working day before a day off is
 * not overdue the morning after.
 */
export function workingMinutesBetween(
  from: Date,
  to: Date,
  cal: BusinessCalendar = DEFAULT_CALENDAR,
): number {
  if (to <= from) return 0;
  let total = 0;
  const last = clockAt(to, cal.timeZone).day;
  let day = clockAt(from, cal.timeZone).day;
  // Walk day by day from the day `from` falls on to the day `to` falls on.
  for (let guard = 0; day <= last && guard < 400; guard += 1) {
    if (isWorkingDay(day, cal)) {
      const opens = zonedInstant(day, cal.startMin, cal.timeZone).getTime();
      const closes = zonedInstant(day, cal.endMin, cal.timeZone).getTime();
      const start = Math.max(opens, from.getTime());
      const end = Math.min(closes, to.getTime());
      if (end > start) total += (end - start) / 60_000;
    }
    day = addDays(day, 1);
  }
  return total;
}
