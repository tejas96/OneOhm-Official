import { distanceMeters, type GeoPoint } from './attendance';

/**
 * The day's travel from site check-ins (PRD 4.3): stops in time order and the distance
 * between them. Distances are straight lines on the map (haversine), not road distance,
 * so the rate per km is set with that in mind.
 */
export interface TravelStop {
  readonly id: string;
  /** 'start' and 'end' are the day's check-in and check-out at an authorised place. */
  readonly kind: 'start' | 'visit' | 'end';
  readonly label: string;
  readonly at: string;
  /** Null when no location was shared at this stop. */
  readonly point: GeoPoint | null;
}

export interface TravelLeg {
  readonly fromId: string;
  readonly toId: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  /** Null when either end has no location: the leg is shown but not paid. */
  readonly distanceM: number | null;
}

/** Legs between consecutive stops, in the order given (sort the stops by time first). */
export function travelLegs(stops: readonly TravelStop[]): TravelLeg[] {
  const legs: TravelLeg[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1];
    const to = stops[index];
    if (!from || !to) continue;
    legs.push({
      fromId: from.id,
      toId: to.id,
      fromLabel: from.label,
      toLabel: to.label,
      distanceM: from.point && to.point ? distanceMeters(from.point, to.point) : null,
    });
  }
  return legs;
}

/** Metres travelled over the legs that have both ends located. */
export function travelDistanceM(legs: readonly TravelLeg[]): number {
  return legs.reduce((total, leg) => total + (leg.distanceM ?? 0), 0);
}

/** What a day's travel is worth: metres × paise per km, rounded to the nearest paisa. */
export function travelAmountPaise(distanceM: number, ratePaisePerKm: number): number {
  if (distanceM <= 0 || ratePaisePerKm <= 0) return 0;
  return Math.round((distanceM * ratePaisePerKm) / 1000);
}

/** Stops sorted by time; the start always first and the end always last. */
export function orderStops(stops: readonly TravelStop[]): TravelStop[] {
  const rank = { start: 0, visit: 1, end: 2 } as const;
  return [...stops].sort((left, right) =>
    rank[left.kind] === rank[right.kind]
      ? left.at.localeCompare(right.at)
      : rank[left.kind] - rank[right.kind],
  );
}
