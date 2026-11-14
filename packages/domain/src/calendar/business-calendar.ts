import { addDays, todayIn } from '@oneohm/shared';

/**
 * The one business calendar: which weekdays and hours the company works, lunch, and the
 * company holidays. Every rule that asks "is the office open" reads this (chat replies,
 * reminders, call promises, visit slots), so changing it in Settings changes them all.
 */
export interface BusinessCalendar {
  readonly timeZone: string;
  /** Days of the week off, 0 = Sunday … 6 = Saturday. */
  readonly weeklyOff: readonly number[];
  /** Opening and closing, minutes after midnight. */
  readonly startMin: number;
  readonly endMin: number;
  /** Lunch break inside the working hours; no visit slot may overlap it. Null = no break. */
  readonly lunch: { readonly startMin: number; readonly endMin: number } | null;
  /** Company holidays, "YYYY-MM-DD". */
  readonly holidays: ReadonlySet<string>;
}

/** Monday to Saturday, 9:30 am to 6:30 pm, lunch 1 to 2 pm, India time, no holidays. */
export const DEFAULT_CALENDAR: BusinessCalendar = {
  timeZone: 'Asia/Kolkata',
  weeklyOff: [0],
  startMin: 9 * 60 + 30,
  endMin: 18 * 60 + 30,
  lunch: { startMin: 13 * 60, endMin: 14 * 60 },
  holidays: new Set<string>(),
};

/** "09:30" as minutes after midnight; NaN when it is not a time. */
export function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : Number.NaN;
}

/** Minutes after midnight as "HH:MM" (600 → "10:00"). */
export function clockString(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** The weekday of a calendar day, 0 = Sunday. */
export const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The minutes the office is open in a working day (lunch is part of the open hours). */
export const openMinutes = (cal: BusinessCalendar = DEFAULT_CALENDAR): number =>
  cal.endMin - cal.startMin;

/** A calendar day the company works: not a weekly day off, not a holiday. */
export function isWorkingDay(day: string, cal: BusinessCalendar = DEFAULT_CALENDAR): boolean {
  return !cal.weeklyOff.includes(weekdayOf(day)) && !cal.holidays.has(day);
}

const SEARCH_DAYS = 400;

/** The next working day after `day` (Saturday → Monday); `day + 1` if no day ever works. */
export function nextWorkingDay(day: string, cal: BusinessCalendar = DEFAULT_CALENDAR): string {
  for (let step = 1; step <= SEARCH_DAYS; step += 1) {
    const next = addDays(day, step);
    if (isWorkingDay(next, cal)) return next;
  }
  return addDays(day, 1);
}

/** `day` itself when it is a working day, else the next one (a holiday Friday → Saturday). */
export function onWorkingDay(day: string, cal: BusinessCalendar = DEFAULT_CALENDAR): string {
  return isWorkingDay(day, cal) ? day : nextWorkingDay(day, cal);
}

/** The working day before `day` (Monday → Saturday); `day - 1` if no day ever works. */
export function previousWorkingDay(day: string, cal: BusinessCalendar = DEFAULT_CALENDAR): string {
  for (let step = 1; step <= SEARCH_DAYS; step += 1) {
    const before = addDays(day, -step);
    if (isWorkingDay(before, cal)) return before;
  }
  return addDays(day, -1);
}

/** The business clock at a moment: its day, minute, weekday and when that day began. */
export function clockAt(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const day = todayIn(timeZone, now);
  const elapsed = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000;
  return {
    day,
    minute: part('hour') * 60 + part('minute'),
    weekday: weekdayOf(day),
    midnight: new Date(now.getTime() - elapsed - now.getMilliseconds()),
  };
}

/** The instant a clock time (minutes after midnight) on a calendar day is reached in a time zone. */
export function zonedInstant(day: string, minutes: number, timeZone: string): Date {
  const guess = Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
  );
  return new Date(guess - (local - guess));
}

/** Open for work now: a working day, from opening up to (not including) closing. */
export function isWorkingTime(now: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): boolean {
  const { day, minute } = clockAt(now, cal.timeZone);
  return isWorkingDay(day, cal) && minute >= cal.startMin && minute < cal.endMin;
}

/** The business calendar from the saved workforce policy hours and the holidays. */
export function calendarFrom(input: {
  readonly timeZone: string;
  readonly weeklyOff: readonly number[];
  readonly dayStart: string;
  readonly dayEnd: string;
  readonly lunchStart?: string | null | undefined;
  readonly lunchEnd?: string | null | undefined;
  readonly holidays?: Iterable<string> | undefined;
}): BusinessCalendar {
  const startMin = parseClock(input.dayStart);
  const endMin = parseClock(input.dayEnd);
  const lunchStart = parseClock(input.lunchStart ?? '');
  const lunchEnd = parseClock(input.lunchEnd ?? '');
  const lunch =
    Number.isNaN(lunchStart) || Number.isNaN(lunchEnd) || lunchEnd <= lunchStart
      ? null
      : { startMin: lunchStart, endMin: lunchEnd };
  return {
    timeZone: input.timeZone,
    weeklyOff: [...input.weeklyOff],
    startMin: Number.isNaN(startMin) ? DEFAULT_CALENDAR.startMin : startMin,
    endMin: Number.isNaN(endMin) ? DEFAULT_CALENDAR.endMin : endMin,
    lunch,
    holidays: new Set(input.holidays ?? []),
  };
}
