/** How far the zone is ahead of UTC at that moment, in ms. */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return (
    Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) -
    at.getTime()
  );
}

/** The moment a calendar day and minute-of-day (e.g. 600 = 10:00) is, on the business clock. */
export function atBusinessTime(day: string, minute: number | null, timeZone: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`) + (minute ?? 600) * 60_000;
  return new Date(wall - offsetMs(new Date(wall - offsetMs(new Date(wall), timeZone)), timeZone));
}
