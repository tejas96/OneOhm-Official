const DAY = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A calendar date as people read it: "9 Nov 2026". */
export const readableDay = (date: string) => DAY.format(new Date(`${date}T00:00:00Z`));
