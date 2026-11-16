import { distanceMeters, type GeoPoint } from './attendance';

/**
 * Whether the place a duty started from can be trusted as the start of paid travel: the
 * person's own base (home), or an office. Travel is paid from where the duty starts, so
 * the start only needs to be a place we know (`far_from_base`, `start_unknown_place`).
 */
export type StartPlace = 'known' | 'far_from_base' | 'unknown_place';

export function startPlaceCheck(input: {
  readonly start: GeoPoint;
  /** The person's saved base, or null when none is saved. */
  readonly base: GeoPoint | null;
  /** Every active work place. */
  readonly offices: readonly GeoPoint[];
  readonly maxKm: number;
}): StartPlace {
  const limitM = input.maxKm * 1000;
  const near = (place: GeoPoint) => distanceMeters(input.start, place) <= limitM;
  if (input.base && near(input.base)) return 'known';
  if (input.offices.some(near)) return 'known';
  return input.base ? 'far_from_base' : 'unknown_place';
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/**
 * A suggested base place from where the person's duty started on recent days: the median of
 * the latitudes and of the longitudes, so one odd day does not move it. Null with no starts.
 */
export function suggestBase(starts: readonly GeoPoint[]): GeoPoint | null {
  if (starts.length === 0) return null;
  return {
    latitude: Number(median(starts.map((p) => p.latitude)).toFixed(6)),
    longitude: Number(median(starts.map((p) => p.longitude)).toFixed(6)),
  };
}
