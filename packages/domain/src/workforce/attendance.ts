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

export interface PlaceMatch {
  readonly location: WorkLocation;
  readonly distanceM: number;
  /** Within the location's radius, allowing for the phone's reported accuracy. */
  readonly inside: boolean;
}

/** The nearest authorised location to a reading, or null when none are set up. */
export function nearestLocation(
  point: GeoPoint & { readonly accuracyM?: number | null | undefined },
  locations: readonly WorkLocation[],
): PlaceMatch | null {
  let best: PlaceMatch | null = null;
  for (const location of locations) {
    const distanceM = distanceMeters(point, location);
    if (best && distanceM >= best.distanceM) continue;
    const slack = Math.min(Math.max(0, point.accuracyM ?? 0), 100);
    best = { location, distanceM, inside: distanceM <= location.radiusM + slack };
  }
  return best;
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
