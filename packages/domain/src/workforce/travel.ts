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
  /** Null only on a claim made before stops without a location were skipped. */
  readonly distanceM: number | null;
}

/**
 * Legs between consecutive stops, in the order given (sort the stops by time first).
 * A stop with no location cannot be measured, so it is skipped: the legs connect the
 * previous stop that has a location to the next one, and both of its neighbours are
 * still paid (live review S2). Every leg returned therefore has a distance.
 */
export function travelLegs(stops: readonly TravelStop[]): TravelLeg[] {
  const located = stops.filter((stop) => stop.point !== null);
  const legs: TravelLeg[] = [];
  for (let index = 1; index < located.length; index += 1) {
    const from = located[index - 1];
    const to = located[index];
    if (!from?.point || !to?.point) continue;
    legs.push({
      fromId: from.id,
      toId: to.id,
      fromLabel: from.label,
      toLabel: to.label,
      distanceM: distanceMeters(from.point, to.point),
    });
  }
  return legs;
}

/** The stops with no location, in order, for a note that they are not counted. */
export function unlocatedStops(stops: readonly TravelStop[]): TravelStop[] {
  return stops.filter((stop) => stop.point === null);
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

/** One day's travel as it is saved when the day closes (live review S3, S4). */
export interface TravelSummary {
  readonly distanceM: number;
  readonly ratePaisePerKm: number;
  readonly visits: number;
  readonly legs: readonly { fromLabel: string; toLabel: string; distanceM: number | null }[];
}

/** Measures the day: stops in time order, the km rate in force that day, the visit count. */
export function summariseTravel(
  stops: readonly TravelStop[],
  ratePaisePerKm: number,
  visits: number,
): TravelSummary {
  const legs = visits > 0 ? travelLegs(stops) : [];
  return {
    distanceM: travelDistanceM(legs),
    ratePaisePerKm,
    visits,
    legs: legs.map(({ fromLabel, toLabel, distanceM }) => ({ fromLabel, toLabel, distanceM })),
  };
}

/**
 * Why a day cannot be claimed, or null when it can (live review S5). A claim is for a
 * closed day only: the person ended it, the night job did, or a correction did.
 */
export function claimBlocker(day: {
  readonly closed: boolean;
  readonly amountPaise: number;
  readonly live: boolean;
  readonly future: boolean;
}): 'future' | 'open_day' | 'claimed' | 'no_travel' | null {
  if (day.future) return 'future';
  if (day.live) return 'claimed';
  if (!day.closed) return 'open_day';
  if (day.amountPaise <= 0) return 'no_travel';
  return null;
}
