/**
 * Where the sun sits on the sign-in sky, from the time of day in the business's
 * timezone. A simple daylight model (06:00–18:30) is enough for a calm picture;
 * it is not an astronomical calculation.
 */
export type SkyPhase = 'morning' | 'midday' | 'evening' | 'night';

const SUNRISE = 6;
const SUNSET = 18.5;

/** Hours since midnight (e.g. 9.25 for 09:15) in the given IANA timezone. */
export function localHours(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour + minute / 60;
}

export function skyPhase(hours: number): SkyPhase {
  if (hours < SUNRISE || hours >= SUNSET) return 'night';
  if (hours < 11) return 'morning';
  if (hours < 15) return 'midday';
  return 'evening';
}

/** The words of a greeting; unlike the sky, "evening" does not start at 15:00. */
export type GreetingPart = 'morning' | 'afternoon' | 'evening' | 'late';

/** Morning 5–12, afternoon 12–17, evening 17–22; the small hours get a neutral "Hello". */
export function greetingPart(hours: number): GreetingPart {
  if (hours >= 5 && hours < 12) return 'morning';
  if (hours >= 12 && hours < 17) return 'afternoon';
  if (hours >= 17 && hours < 22) return 'evening';
  return 'late';
}

/** 0 at sunrise, 1 at sunset (clamped), for placing the sun along its arc. */
export function dayProgress(hours: number): number {
  return Math.min(1, Math.max(0, (hours - SUNRISE) / (SUNSET - SUNRISE)));
}

/** A point on the quadratic arc from `start` through `control` to `end`. */
export function pointOnArc(
  t: number,
  start: readonly [number, number],
  control: readonly [number, number],
  end: readonly [number, number],
): [number, number] {
  const u = 1 - t;
  return [
    u * u * start[0] + 2 * u * t * control[0] + t * t * end[0],
    u * u * start[1] + 2 * u * t * control[1] + t * t * end[1],
  ];
}
