const DAY = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A calendar date as people read it: "9 Nov 2026". */
export const readableDay = (date: string) => DAY.format(new Date(`${date}T00:00:00Z`));

const SPAN_DAY = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Mon, 9 Nov", or "Mon, 9 Nov – Tue, 10 Nov" for a range. */
export function daySpan(from: string, to: string): string {
  const one = (date: string) => SPAN_DAY.format(new Date(`${date}T00:00:00Z`));
  return from === to ? one(from) : `${one(from)} – ${one(to)}`;
}
