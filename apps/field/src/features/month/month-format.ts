import { addDays } from '../../lib/dates';

const monthName = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortName = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });
const dayName = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const at = (date: string) => new Date(`${date}T00:00:00Z`);

/** "2026-11" for a calendar date. */
export const monthOf = (date: string): string => date.slice(0, 7);

/** The month a number of months away ("2026-01" − 1 = "2025-12"). */
export function shiftMonth(month: string, delta: number): string {
  const [year = 0, mon = 1] = month.split('-').map(Number);
  const index = year * 12 + (mon - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** "November 2026". */
export const monthTitle = (month: string): string => monthName.format(at(`${month}-01`));

/** "Wed, 12 Nov". */
export const dayTitle = (date: string): string => dayName.format(at(date));

/** "16 Nov" for a calendar date. */
export const dayMonth = (date: string): string =>
  `${Number(date.slice(8))} ${shortName.format(at(date))}`;

/** Months after the current one have nothing to show. */
export const canGoNext = (month: string, today: string): boolean => month < monthOf(today);

/** Just the number: 18.5 or 18. */
export const plainDays = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/** Days as the person says them: 18.5 days, 1 day, 0 days. */
export const formatDays = (value: number): string =>
  `${plainDays(value)} ${value === 1 ? 'day' : 'days'}`;

/** "8 h 30 min", "9 h", "45 min". */
export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Day numbers a flag is about: "12, 15, 18 Nov" or "1, 2, 3, 4 Nov +2 more". */
export function dayList(days: readonly string[], more: (n: number) => string, limit = 4): string {
  const first = days[0];
  if (!first) return '';
  const shown = days.slice(0, limit).map((date) => Number(date.slice(8)));
  const rest = days.length - shown.length;
  return `${shown.join(', ')} ${shortName.format(at(first))}${rest > 0 ? ` ${more(rest)}` : ''}`;
}

/**
 * The month as Monday-first weeks: leading blanks (null) so the 1st lands on its weekday,
 * and trailing blanks so every week has seven cells.
 */
export function calendarWeeks<T extends { readonly date: string }>(
  days: readonly T[],
): (T | null)[][] {
  const first = days[0];
  if (!first) return [];
  const lead = (at(first.date).getUTCDay() + 6) % 7;
  const cells: (T | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The last day of a month. */
export const lastDayOf = (month: string): string => addDays(`${shiftMonth(month, 1)}-01`, -1);
