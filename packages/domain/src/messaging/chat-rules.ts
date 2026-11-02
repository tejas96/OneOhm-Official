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

/** The business clock now: the minute of the day there and when today began there. */
function clockAt(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const elapsed = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000;
  return {
    minute: part('hour') * 60 + part('minute'),
    midnight: new Date(now.getTime() - elapsed - now.getMilliseconds()),
  };
}

export function isWorkingTime(now: Date, timeZone: string): boolean {
  const { minute } = clockAt(now, timeZone);
  return minute >= WORK_START_MIN && minute < WORK_END_MIN;
}

/** When working hours last ended: 6:30 pm today once it is past, else 6:30 pm yesterday. */
export function lastWorkEnd(now: Date, timeZone: string): Date {
  const { minute, midnight } = clockAt(now, timeZone);
  const todayEnd = new Date(midnight.getTime() + WORK_END_MIN * 60_000);
  return minute >= WORK_END_MIN ? todayEnd : new Date(todayEnd.getTime() - 24 * 3600_000);
}

/**
 * How late an answer is, in working minutes: the clock starts when the customer wrote,
 * or at 9:30 in the morning for a message sent overnight. 1 nudges the person answering,
 * 2 is late (the desk is told); null is not yet, or outside working hours.
 */
export function chatWaitStage(lastInAt: Date, now: Date, timeZone: string): 1 | 2 | null {
  if (!isWorkingTime(now, timeZone)) return null;
  const { midnight } = clockAt(now, timeZone);
  const dayStart = new Date(midnight.getTime() + WORK_START_MIN * 60_000);
  const from = lastInAt > dayStart ? lastInAt : dayStart;
  const minutes = (now.getTime() - from.getTime()) / 60_000;
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
