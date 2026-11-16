import type { MonthDayRecord } from '@oneohm/api-contracts';
import { addDays, monthOf } from '@oneohm/shared';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** This month in the business time zone, as `YYYY-MM` (the shared business-month helper). */
export const currentMonth = (now: Date = new Date()) => monthOf(now);

/** The month in the address (`?month=2026-10`), or this one when it is missing or not a month. */
export const monthFromParam = (value: string | null, fallback: string = currentMonth()) =>
  value && MONTH_PATTERN.test(value) ? value : fallback;

/** The month a number of months away: ("2026-01", -1) → "2025-12". */
export function shiftMonth(month: string, by: number): string {
  const [year = 0, number = 1] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** The last calendar day of a month: ("2026-02") → "2026-02-28". */
export const lastDayOf = (month: string) => addDays(`${shiftMonth(month, 1)}-01`, -1);

/** Weekday with Monday = 0 and Sunday = 6, for a calendar date. */
export const mondayFirst = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;

/** The month as weeks of seven, Monday first; days outside the month are null. */
export function weeksOf(days: readonly MonthDayRecord[]): (MonthDayRecord | null)[][] {
  const first = days[0];
  if (!first) return [];
  const cells: (MonthDayRecord | null)[] = [
    ...Array.from({ length: mondayFirst(first.date) }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/** Days as people say them: whole when whole, otherwise to the half (1.5, 0.5). */
export const dayCount = (value: number) => String(Math.round(value * 100) / 100);

/** Late marks with what they cost: "3 (−0.5)"; just the number when nothing is taken off. */
export const lateText = (lates: number, deduction: number) =>
  deduction > 0 ? `${lates} (−${dayCount(deduction)})` : String(lates);

/** Hours and minutes worked: 495 → "8h 15m". */
export function workedText(minutes: number | null): string | null {
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest}m` : rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export interface BreakdownCounts {
  readonly present: number;
  readonly halfDays: number;
  readonly paidLeave: number;
  readonly holidays: number;
  readonly weeklyOffs: number;
  /** Days off not paid (no work that week); shown, adding nothing. */
  readonly unpaidOffs?: number;
  readonly lateDeduction: number;
  readonly payableDays: number;
}

export interface BreakdownLine {
  readonly key:
    | 'present'
    | 'half'
    | 'paidLeave'
    | 'holidays'
    | 'weeklyOffs'
    | 'unpaidOffs'
    | 'late'
    | 'other';
  /** Days this line adds (negative for the late deduction). */
  readonly days: number;
  /** How many days it is made from, when that differs (half days count half). */
  readonly of?: number;
}

/**
 * How the payable days add up: present, half days at half, paid leave, holidays and weekly offs,
 * less the late deduction. Lines that are zero are left out. If the lines do not reach the
 * payable days the server counted (for example a day worked on a day off), the gap is shown as
 * its own line, so the sum on screen always equals the number in the table.
 */
export function breakdownLines(counts: BreakdownCounts): BreakdownLine[] {
  const lines: BreakdownLine[] = [
    { key: 'present', days: counts.present },
    { key: 'half', days: counts.halfDays / 2, of: counts.halfDays },
    { key: 'paidLeave', days: counts.paidLeave },
    { key: 'holidays', days: counts.holidays },
    { key: 'weeklyOffs', days: counts.weeklyOffs },
    { key: 'unpaidOffs', days: 0, of: counts.unpaidOffs ?? 0 },
    { key: 'late', days: -counts.lateDeduction },
  ];
  const sum = lines.reduce((total, line) => total + line.days, 0);
  const gap = Math.round((counts.payableDays - sum) * 100) / 100;
  const shown = lines.filter((line) => line.days !== 0 || (line.of ?? 0) > 0);
  return gap === 0 ? shown : [...shown, { key: 'other', days: gap }];
}
