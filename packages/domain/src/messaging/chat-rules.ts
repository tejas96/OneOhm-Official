/** WhatsApp chat rules shared by the API and the worker: the working clock and who answers. */

/**
 * Working hours, in minutes after midnight: 9:30 am to 6:30 pm, the hours customers are
 * told. Reminders, "late" and the night reply all follow them.
 */
export const WORK_START_MIN = 9 * 60 + 30;
export const WORK_END_MIN = 18 * 60 + 30;
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The business clock now: the minute and weekday there (0 Sunday) and when today began. */
function clockAt(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const elapsed = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000;
  return {
    minute: part('hour') * 60 + part('minute'),
    weekday: WEEKDAYS.indexOf(parts.find((entry) => entry.type === 'weekday')?.value ?? ''),
    midnight: new Date(now.getTime() - elapsed - now.getMilliseconds()),
  };
}

/** Monday to Saturday, 9:30 am up to 6:30 pm; Sunday is closed (redesign §14). */
export function isWorkingTime(now: Date, timeZone: string): boolean {
  const { minute, weekday } = clockAt(now, timeZone);
  return weekday !== 0 && minute >= WORK_START_MIN && minute < WORK_END_MIN;
}

/**
 * When a person can reply, as the customer is told: `now` in working hours, else the
 * morning it opens again (9:30 today, tomorrow, or Monday after Saturday evening).
 */
export type ReplyTime = 'now' | 'today' | 'tomorrow' | 'monday';

export function replyTime(now: Date, timeZone: string): ReplyTime {
  if (isWorkingTime(now, timeZone)) return 'now';
  const { minute, weekday } = clockAt(now, timeZone);
  if (weekday !== 0 && minute < WORK_START_MIN) return 'today';
  return weekday === 6 ? 'monday' : 'tomorrow';
}

/** The day a promised call is due: today, the next working day, or Monday. */
export type CallDay = 'today' | 'tomorrow' | 'monday';

/** How a promised call's day is said (the English words; the staff history uses them). */
export const CALL_DAY_WORDS: Record<CallDay, string> = {
  today: 'today',
  tomorrow: 'tomorrow morning',
  monday: 'on Monday morning',
};

/**
 * When a call promised at `now` is due, by the same clock as `replyTime`: today in working
 * hours (or before 9:30 on a working day), else the next working morning — Monday after
 * Saturday evening — with the days to add to today.
 */
export function callDay(now: Date, timeZone: string): { day: CallDay; add: 0 | 1 | 2 } {
  const time = replyTime(now, timeZone);
  if (time === 'now' || time === 'today') return { day: 'today', add: 0 };
  return time === 'monday' ? { day: 'monday', add: 2 } : { day: 'tomorrow', add: 1 };
}

/**
 * When working hours last ended: 6:30 pm today once it is past, else 6:30 pm on the working
 * day before. Sunday is closed, so all Sunday and Monday morning it is Saturday's 6:30 pm.
 */
export function lastWorkEnd(now: Date, timeZone: string): Date {
  const { minute, midnight, weekday } = clockAt(now, timeZone);
  const todayEnd = new Date(midnight.getTime() + WORK_END_MIN * 60_000);
  // Sunday is closed: its evening is no work end (Saturday's is).
  let back = minute >= WORK_END_MIN && weekday !== 0 ? 0 : 1;
  if ((weekday - back + 7) % 7 === 0) back += 1;
  return new Date(todayEnd.getTime() - back * 24 * 3600_000);
}

/**
 * Working minutes since `from`, on the working clock: it starts when `from` happened, or
 * at 9:30 in the morning for anything earlier; 0 outside working hours.
 */
export function workingMinutesSince(from: Date, now: Date, timeZone: string): number {
  if (!isWorkingTime(now, timeZone)) return 0;
  const { midnight } = clockAt(now, timeZone);
  const dayStart = new Date(midnight.getTime() + WORK_START_MIN * 60_000);
  const start = from > dayStart ? from : dayStart;
  return Math.max(0, (now.getTime() - start.getTime()) / 60_000);
}

/**
 * How late an answer is, in working minutes: the clock starts when the customer wrote,
 * or at 9:30 in the morning for a message sent overnight. 1 nudges the person answering,
 * 2 is late (the desk is told); null is not yet, or outside working hours.
 */
export function chatWaitStage(lastInAt: Date, now: Date, timeZone: string): 1 | 2 | null {
  const minutes = workingMinutesSince(lastInAt, now, timeZone);
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
 * Working minutes between two moments on the working clock: Monday to Saturday, 9:30 to 18:30,
 * Sunday closed. A staff check "after 1 working day" is 540 of these, "after 2" is 1080, so a
 * Friday-evening answer is not overdue on Saturday morning and Sunday never counts.
 */
export function workingMinutesBetween(from: Date, to: Date, timeZone: string): number {
  if (to <= from) return 0;
  let total = 0;
  let { midnight } = clockAt(from, timeZone);
  // Walk day by day (a day is never longer than 25 hours; the clock gives each midnight).
  for (let guard = 0; midnight < to && guard < 400; guard += 1) {
    const day = clockAt(new Date(midnight.getTime() + 12 * 3_600_000), timeZone);
    if (day.weekday !== 0) {
      const opens = midnight.getTime() + WORK_START_MIN * 60_000;
      const closes = midnight.getTime() + WORK_END_MIN * 60_000;
      const start = Math.max(opens, from.getTime());
      const end = Math.min(closes, to.getTime());
      if (end > start) total += (end - start) / 60_000;
    }
    midnight = new Date(midnight.getTime() + 24 * 3_600_000);
  }
  return total;
}
