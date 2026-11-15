import { addDays, daysBetween } from '@oneohm/shared';

export type DayChoice = 'today' | 'yesterday' | 'other';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Which chip a day opens on: the one for today or yesterday, else "another day". */
export function choiceFor(date: string | null, today: string): DayChoice {
  if (!date || date === today) return 'today';
  return date === addDays(today, -1) ? 'yesterday' : 'other';
}

/**
 * The work date a correction names: today, yesterday, or a typed day within the window.
 * `date` is null while the typed day is not a real day, in the future or too old.
 */
export function correctionDay(
  choice: DayChoice,
  typed: string,
  today: string,
  windowDays: number,
): { readonly date: string | null } {
  if (choice === 'today') return { date: today };
  if (choice === 'yesterday') return { date: addDays(today, -1) };
  const value = typed.trim();
  if (!DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return { date: null };
  if (addDays(value, 0) !== value) return { date: null };
  const back = daysBetween(value, today);
  return { date: back >= 0 && back <= windowDays ? value : null };
}
