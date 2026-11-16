import { addDays, daysBetween } from '@oneohm/shared';
import {
  type BusinessCalendar,
  clockAt,
  clockString,
  isWorkingDay,
  zonedInstant,
} from '../calendar/business-calendar';
import { isLateCheckIn } from './attendance';

/**
 * Late means after the day start plus grace, on a working day only (live review A7): a
 * check-in on a holiday or weekly off is never late. Check-in and corrections both use
 * this, so a corrected time is judged the same way as a live one.
 */
export function isLateOnDay(
  checkInAt: Date,
  workDate: string,
  rule: { readonly dayStart: string; readonly graceMinutes: number },
  calendar: BusinessCalendar,
): boolean {
  if (!isWorkingDay(workDate, calendar)) return false;
  const clock = clockString(clockAt(checkInAt, calendar.timeZone).minute);
  return isLateCheckIn(clock, rule.dayStart, rule.graceMinutes);
}

/** How far back a person may ask to correct a day, in days (live review A1). */
export const CORRECTION_WINDOW_DAYS = 31;

/** A day to correct must not be in the future or older than the window; null when fine. */
export function correctionDateProblem(workDate: string, today: string): string | null {
  if (workDate > today) return 'Pick today or an earlier day.';
  if (daysBetween(workDate, today) > CORRECTION_WINDOW_DAYS)
    return `Corrections go back ${CORRECTION_WINDOW_DAYS} days. Ask your manager for older days.`;
  return null;
}

/** A day is at most this long from check-in to check-out. */
export const LONGEST_DAY_MS = 24 * 3_600_000;

export interface DayTimes {
  readonly checkInAt: Date;
  readonly checkOutAt: Date | null;
}

export type MergedDayProblem =
  | 'no_day'
  | 'nothing_changes'
  | 'check_in_date'
  | 'check_out_order'
  | 'too_long';

/**
 * What is wrong with the day a correction would leave (live review A6), or null. The
 * corrected times are laid over the recorded day and the result is judged as a whole:
 * there must be a check-in (a check-out alone, with no day, writes nothing), it must fall on
 * the work date in business time, and the check-out must come after it within 24 hours.
 */
export function mergedDayProblem(input: {
  readonly workDate: string;
  readonly day: DayTimes | null;
  readonly checkInAt: Date | null;
  readonly checkOutAt: Date | null;
  readonly timeZone: string;
}): MergedDayProblem | null {
  const { day, workDate } = input;
  const checkIn = input.checkInAt ?? day?.checkInAt ?? null;
  const checkOut = input.checkOutAt ?? day?.checkOutAt ?? null;
  if (!checkIn) return 'no_day';
  const same = (a: Date | null, b: Date | null) => a?.getTime() === b?.getTime();
  const changes =
    !day ||
    (input.checkInAt !== null && !same(input.checkInAt, day.checkInAt)) ||
    (input.checkOutAt !== null && !same(input.checkOutAt, day.checkOutAt));
  if (!changes) return 'nothing_changes';
  if (clockAt(checkIn, input.timeZone).day !== workDate) return 'check_in_date';
  if (!checkOut) return null;
  if (checkOut <= checkIn) return 'check_out_order';
  return checkOut.getTime() - checkIn.getTime() > LONGEST_DAY_MS ? 'too_long' : null;
}

/** Words for each problem, said to the person (and the approver, if it arises late). */
export const MERGED_DAY_MESSAGES: Readonly<Record<MergedDayProblem, string>> = {
  no_day: 'There is no check-in on that day. Give the check-in time too.',
  nothing_changes: 'Those times are already on that day.',
  check_in_date: 'The check-in must be on the day you are correcting.',
  check_out_order: 'Check-out must be after check-in.',
  too_long: 'Check-out must be within 24 hours of check-in.',
};

/**
 * Where a forgotten day ends (live review A1): at the person's last known activity (the
 * check-in, or a site visit's check-in or check-out that day), never before the check-in
 * and never after the day's own end (midnight of the work date, business time).
 */
export function autoCloseAt(input: {
  readonly workDate: string;
  readonly checkInAt: Date;
  readonly activity: readonly (Date | null)[];
  readonly timeZone: string;
}): Date {
  const dayEnd = zonedInstant(addDays(input.workDate, 1), 0, input.timeZone);
  let last = input.checkInAt;
  for (const at of input.activity) if (at && at > last) last = at;
  return last > dayEnd ? dayEnd : last;
}
