/** A point on the map, in degrees. */
export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface WorkLocation extends GeoPoint {
  readonly id: string;
  readonly name: string;
  /** How far from the point still counts as being there, in metres. */
  readonly radiusM: number;
}

const EARTH_RADIUS_M = 6_371_000;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance along the earth's surface (haversine), in whole metres. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * Where a reading stands against one place, allowing for the phone's accuracy (live review
 * A4). Accuracy never makes "inside" easier: the whole circle of doubt must fit in the
 * fence to be inside, and none of it may touch the fence to be outside. Anything between
 * is unsure, and is kept as null (not true, not false) so nobody is marked wrongly.
 */
export type Fence = 'inside' | 'outside' | 'unsure';

export function fenceOf(distanceM: number, radiusM: number, accuracyM?: number | null): Fence {
  const doubt = Math.max(0, accuracyM ?? 0);
  if (distanceM + doubt <= radiusM) return 'inside';
  if (distanceM - doubt > radiusM) return 'outside';
  return 'unsure';
}

export interface PlaceMatch {
  readonly location: WorkLocation;
  readonly distanceM: number;
  /** True inside, false outside, null when the accuracy is too poor to tell (see `fenceOf`). */
  readonly inside: boolean | null;
}

const RANK: Readonly<Record<Fence, number>> = { inside: 0, unsure: 1, outside: 2 };

/**
 * The place a reading belongs to, or null when none are set up (live review A3). Inside
 * any active place counts as inside, so the nearest one is not the only one asked. With
 * none containing it, "unsure" about any place beats "outside" all of them. Ties go to the
 * nearer place.
 */
export function nearestLocation(
  point: GeoPoint & { readonly accuracyM?: number | null | undefined },
  locations: readonly WorkLocation[],
): PlaceMatch | null {
  let best: { match: PlaceMatch; fence: Fence } | null = null;
  for (const location of locations) {
    const distanceM = distanceMeters(point, location);
    const fence = fenceOf(distanceM, location.radiusM, point.accuracyM);
    const better =
      !best ||
      RANK[fence] < RANK[best.fence] ||
      (RANK[fence] === RANK[best.fence] && distanceM < best.match.distanceM);
    if (better)
      best = {
        fence,
        match: { location, distanceM, inside: fence === 'unsure' ? null : fence === 'inside' },
      };
  }
  return best?.match ?? null;
}

/** Minutes since midnight for "HH:MM". */
export function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** A check-in after the day start plus grace is late. Times are "HH:MM", India time. */
export function isLateCheckIn(checkIn: string, dayStart: string, graceMinutes: number): boolean {
  return minutesOf(checkIn) > minutesOf(dayStart) + graceMinutes;
}
