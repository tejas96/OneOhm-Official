import { distanceMeters, type GeoPoint, type WorkLocation } from './attendance';
import { ROUTE_GAP_MINUTES } from './route-km';

/**
 * Where a person stood still during their duty day (Duty Day step 5). Pure: the caller hands
 * over the day's kept route points (`keptPoints`) in time order, the work places and the
 * day's customer sites.
 */

/** Staying within this distance of where the stay began is standing still, in metres. */
export const STOP_RADIUS_M = 100;
/** Standing still this long or longer is a stop, in minutes. */
export const STOP_MIN_MINUTES = 10;
/** An unknown stop this long or longer is flagged, unless Settings say otherwise. */
export const DEFAULT_UNKNOWN_STOP_MINUTES = 45;
/** A stop this close to the person's saved base place (home) is at it, in metres. */
export const HOME_BASE_RADIUS_M = 150;
/** What a stop at the person's base place is called. */
export const HOME_BASE_LABEL = 'Home base';

/** An office or store (inside an active work place), a customer site of the day, or neither. */
export const STOP_PLACES = ['office', 'site', 'unknown'] as const;
export type StopPlace = (typeof STOP_PLACES)[number];

export interface StopPoint extends GeoPoint {
  readonly recordedAt: Date;
}

/** A customer site the person had work at, or visited, that day, with its fence. */
export interface StopSite extends GeoPoint {
  readonly id: string;
  readonly label: string;
  readonly radiusM: number;
}

export interface Stop {
  readonly startAt: Date;
  readonly endAt: Date;
  readonly minutes: number;
  /** The average of the points of the stay. */
  readonly centre: GeoPoint;
  readonly place: StopPlace;
  /** The office's name or the site's label; null for an unknown stop. */
  readonly placeLabel: string | null;
  /** The work place's or site's id; null for an unknown stop. */
  readonly placeId: string | null;
  /** An unknown stop of `unknownStopMinutes` or more. */
  readonly flagged: boolean;
}

const minutesBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;

function centreOf(points: readonly StopPoint[]): GeoPoint {
  const sum = points.reduce(
    (total, point) => ({
      latitude: total.latitude + point.latitude,
      longitude: total.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return { latitude: sum.latitude / points.length, longitude: sum.longitude / points.length };
}

/**
 * The stays of the day: from each point, the run of following points within 100 m of it; a
 * run of 10 minutes or more is a stay and the search goes on after it. A silence of over 20
 * minutes (a gap) ends a run, so a stay never hides a gap.
 */
export function findStays(
  points: readonly StopPoint[],
): { startAt: Date; endAt: Date; centre: GeoPoint }[] {
  const stays: { startAt: Date; endAt: Date; centre: GeoPoint }[] = [];
  let start = 0;
  while (start < points.length) {
    const anchor = points[start] as StopPoint;
    let end = start;
    for (let next = start + 1; next < points.length; next += 1) {
      const point = points[next] as StopPoint;
      const before = points[next - 1] as StopPoint;
      if (distanceMeters(anchor, point) > STOP_RADIUS_M) break;
      if (minutesBetween(before.recordedAt, point.recordedAt) > ROUTE_GAP_MINUTES) break;
      end = next;
    }
    const last = points[end] as StopPoint;
    if (minutesBetween(anchor.recordedAt, last.recordedAt) >= STOP_MIN_MINUTES) {
      const run = points.slice(start, end + 1);
      stays.push({ startAt: anchor.recordedAt, endAt: last.recordedAt, centre: centreOf(run) });
      start = end + 1;
    } else start += 1;
  }
  return stays;
}

/** Inside an active work place first, then within a site's fence, else unknown. */
export function placeOf(
  centre: GeoPoint,
  offices: readonly WorkLocation[],
  sites: readonly StopSite[],
): { place: StopPlace; label: string | null; id: string | null } {
  const nearest = <T extends GeoPoint & { radiusM: number }>(places: readonly T[]) =>
    places
      .map((place) => ({ place, distanceM: distanceMeters(centre, place) }))
      .filter((entry) => entry.distanceM <= entry.place.radiusM)
      .sort((a, b) => a.distanceM - b.distanceM)[0]?.place;
  const office = nearest(offices);
  if (office) return { place: 'office', label: office.name, id: office.id };
  const site = nearest(sites);
  if (site) return { place: 'site', label: site.label, id: site.id };
  return { place: 'unknown', label: null, id: null };
}

/**
 * The day's stops, each named and an unknown one of `unknownStopMinutes` or more flagged.
 * Only points inside the duty window (`window`, when given) count. The person's saved base
 * place (`base`) is a known place, named "Home base", like a work place.
 */
export function dayStops(
  points: readonly StopPoint[],
  places: {
    readonly offices: readonly WorkLocation[];
    readonly sites: readonly StopSite[];
    readonly unknownStopMinutes: number;
    readonly base?: GeoPoint | null;
    readonly window?: { readonly start: Date; readonly end: Date | null };
  },
): Stop[] {
  const { window, base } = places;
  const inside = window
    ? points.filter(
        (point) =>
          point.recordedAt >= window.start && (!window.end || point.recordedAt <= window.end),
      )
    : points;
  const offices: WorkLocation[] = base
    ? [
        ...places.offices,
        {
          id: 'home_base',
          name: HOME_BASE_LABEL,
          radiusM: HOME_BASE_RADIUS_M,
          latitude: base.latitude,
          longitude: base.longitude,
        },
      ]
    : [...places.offices];
  return findStays(inside).map((stay) => {
    const minutes = Math.round(minutesBetween(stay.startAt, stay.endAt));
    const where = placeOf(stay.centre, offices, places.sites);
    return {
      ...stay,
      minutes,
      place: where.place,
      placeLabel: where.label,
      placeId: where.id,
      flagged: where.place === 'unknown' && minutes >= places.unknownStopMinutes,
    };
  });
}
