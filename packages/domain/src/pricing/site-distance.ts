import { distanceMeters, type GeoPoint } from '../workforce/attendance';

/**
 * Road distance from the base to a site (PRD 3.9 B): the straight line times the road
 * factor, in whole kilometres. Null when either point is unknown; people can always
 * type the distance instead.
 */
export function roadDistanceKm(
  base: GeoPoint | null,
  site: GeoPoint | null,
  roadFactorBp: number,
): number | null {
  if (!base || !site) return null;
  return Math.round((distanceMeters(base, site) * roadFactorBp) / 10_000 / 1000);
}

/** A point when both coordinates are known and on the globe. */
export function geoPoint(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): GeoPoint | null {
  if (latitude === null || latitude === undefined) return null;
  if (longitude === null || longitude === undefined) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
