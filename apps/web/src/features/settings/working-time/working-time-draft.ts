import type { Holiday, WorkingTimeRecord } from '@oneohm/api-contracts';

/** Holidays in date order, one per date (a later entry for the same date wins). */
export function sortedHolidays(holidays: readonly Holiday[]): Holiday[] {
  const byDay = new Map(holidays.map((holiday) => [holiday.day, holiday]));
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Adds (or renames) a holiday; null when the date or name is missing. */
export function withHoliday(
  holidays: readonly Holiday[],
  day: string,
  name: string,
): Holiday[] | null {
  const trimmed = name.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || trimmed === '') return null;
  return sortedHolidays([...holidays, { day, name: trimmed }]);
}

export const withoutHoliday = (holidays: readonly Holiday[], day: string): Holiday[] =>
  holidays.filter((holiday) => holiday.day !== day);

/** Turns a weekday on or off (0 = Sunday); the week keeps at least one working day. */
export function toggledOff(weeklyOff: readonly number[], weekday: number): number[] {
  if (weeklyOff.includes(weekday)) return weeklyOff.filter((day) => day !== weekday);
  if (weeklyOff.length >= 6) return [...weeklyOff];
  return [...weeklyOff, weekday].sort((a, b) => a - b);
}

/** Lunch on gets the usual 1–2 pm (kept inside the hours by the checker); off clears both. */
export function withLunch(work: WorkingTimeRecord, on: boolean): WorkingTimeRecord {
  return on
    ? { ...work, lunchStart: work.lunchStart ?? '13:00', lunchEnd: work.lunchEnd ?? '14:00' }
    : { ...work, lunchStart: null, lunchEnd: null };
}

/** Visit times in clock order, each once. */
export function sortedSlots(starts: readonly string[], add?: string): string[] {
  return [...new Set(add ? [...starts, add] : starts)].sort();
}
