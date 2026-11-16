import type { EmploymentPeriod } from './month-sheet-types';

/** A departure or a return to the team, as recorded when it happened. */
export interface EmploymentEvent {
  readonly kind: 'left' | 'rejoined';
  /** The last working day (left) or the first day back (rejoined). */
  readonly day: string;
}

/**
 * Employment as periods, from the day the person joined: each recorded departure ends a
 * period and each rejoin starts the next. `leftOn` (the person's current last working day)
 * ends the open period when no departure was recorded for it (people who left before
 * departures were kept).
 */
export function employmentPeriods(
  joinedOn: string,
  events: readonly EmploymentEvent[],
  leftOn: string | null,
): EmploymentPeriod[] {
  const periods: EmploymentPeriod[] = [];
  let from: string | null = joinedOn;
  for (const event of events) {
    if (event.kind === 'left' && from !== null) {
      periods.push({ from, to: event.day });
      from = null;
    } else if (event.kind === 'rejoined' && from === null) from = event.day;
  }
  if (from !== null) periods.push({ from, to: leftOn !== null && leftOn >= from ? leftOn : null });
  return periods;
}

/** Outside every period: before the first one "not joined", otherwise "left". Null inside one. */
export function employmentStatus(
  periods: readonly EmploymentPeriod[],
  date: string,
): 'not_joined' | 'left' | null {
  const first = periods[0];
  if (!first || date < first.from) return 'not_joined';
  const inside = periods.some((one) => one.from <= date && (one.to === null || date <= one.to));
  return inside ? null : 'left';
}

/** One saved monthly pay: what it is from a day on (null = cleared). */
export interface PayChange {
  readonly monthlyPayPaise: number | null;
  readonly effectiveFrom: string;
}

/**
 * The monthly pay in force on a day: the latest change from that day or before. The first pay
 * ever saved also covers the months before it, so setting a person's pay once pays their
 * earlier open months too; later changes start on the day they were made.
 */
export function payOn(history: readonly PayChange[], day: string): number | null {
  const sorted = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const inForce = sorted.filter((change) => change.effectiveFrom <= day).at(-1) ?? sorted[0];
  return inForce?.monthlyPayPaise ?? null;
}
