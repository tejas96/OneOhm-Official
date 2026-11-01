const longDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "4 November 2026" for a calendar date (YYYY-MM-DD): plain Indian style. */
export function plainDate(date: string): string {
  return longDate.format(new Date(`${date}T00:00:00Z`));
}
