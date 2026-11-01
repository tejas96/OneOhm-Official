/**
 * Calendar dates (`YYYY-MM-DD`) for schedules, kept as strings so no timezone ever
 * shifts a due date. Instants (timestamps) are stored separately as UTC.
 */
const DAY_MS = 86_400_000;

export function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(time)) throw new Error(`Not a calendar date: ${date}`);
  return new Date(time + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Today in the business timezone (India), as a calendar date. */
export function todayIn(timeZone = 'Asia/Kolkata', now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
