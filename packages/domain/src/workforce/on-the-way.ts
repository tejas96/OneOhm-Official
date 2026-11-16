import { distanceMeters, type GeoPoint } from './attendance';
import { keptPoints, ROUTE_JITTER_FLOOR_M, type RoutePoint } from './route-km';

/**
 * The customer's "on the way" message (Duty Day step 6): when it goes, and the ETA it says.
 * Pure: the server hands over the person's points and their next job after each upload.
 */

/** Roads are longer than the straight line by about this much. */
export const ETA_ROAD_FACTOR = 1.4;
/** A rough town drive, in km/h (the live map's "Send nearest" uses the same speed). */
export const ETA_KMH = 25;
/** The ETA is said in steps of this many minutes, never less than one step. */
export const ETA_STEP_MINUTES = 5;
/** The message goes only when the ETA is this many minutes or less. */
export const ON_WAY_MAX_MINUTES = 45;
/** This many usable points in a row must each be closer to the site than the one before. */
export const ON_WAY_POINTS = 3;
/** The newest of them must be this fresh, in minutes: older points say nothing about now. */
export const ON_WAY_FRESH_MINUTES = 10;

/**
 * The customer's ETA for a straight-line distance: the road (straight × 1.4) at 25 km/h,
 * rounded up to 5 minutes, at least 5.
 */
export function visitEtaMinutes(straightM: number): number {
  const minutes = ((Math.max(0, straightM) * ETA_ROAD_FACTOR) / 1000 / ETA_KMH) * 60;
  // A hair over a step (float noise) is not the next step.
  const steps = Math.ceil(minutes / ETA_STEP_MINUTES - 1e-9);
  return Math.max(1, steps) * ETA_STEP_MINUTES;
}

/** One piece of work at a customer's site today, as the "next job" choice sees it. */
export interface JobToday {
  /** The task, or the service request. */
  readonly id: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** A planned visit for it is today. */
  readonly planned: boolean;
  /** That planned visit's start, minutes after midnight; null when untimed or none. */
  readonly startMin: number | null;
  /** Someone already checked in at it today. */
  readonly arrived: boolean;
}

/**
 * The person's next job today: work with a known site location nobody has checked in at
 * yet; planned visits first, the earliest start first (untimed last), then by id.
 */
export function nextJobToday<T extends JobToday>(jobs: readonly T[]): T | null {
  const open = jobs.filter(
    (job) => !job.arrived && job.latitude !== null && job.longitude !== null,
  );
  const rank = (job: JobToday) => (job.planned ? 0 : 1);
  const start = (job: JobToday) => job.startMin ?? Number.MAX_SAFE_INTEGER;
  const [first] = [...open].sort(
    (a, b) => rank(a) - rank(b) || start(a) - start(b) || a.id.localeCompare(b.id),
  );
  return first ?? null;
}

export interface OnWayInput {
  /** The person's duty day is open. */
  readonly onDuty: boolean;
  /** The person has a site visit open now (they are at a site, not on the way). */
  readonly atSite: boolean;
  /** The next job's site. */
  readonly site: GeoPoint;
  /** The site's fence, in metres: inside it the arrival takes over. */
  readonly radiusM: number;
  /** The person's recent route points, any order, mocked and vague ones included. */
  readonly points: readonly RoutePoint[];
  readonly now: Date;
}

export type OnWay =
  | { readonly send: true; readonly minutes: number; readonly distanceM: number }
  | {
      readonly send: false;
      readonly reason:
        | 'off_duty'
        | 'at_site'
        | 'few_points'
        | 'stale'
        | 'not_closer'
        | 'far'
        | 'there';
    };

/**
 * Whether to tell the customer the person is on the way: on duty, not at a site, and the last
 * three usable points (not mocked, not vague, not a jump) each closer to the site than the one
 * before by more than GPS jitter (25 m), the newest under 10 minutes old, still outside the
 * fence, and the ETA from it 45 minutes or less.
 */
export function onTheWay(input: OnWayInput): OnWay {
  if (!input.onDuty) return { send: false, reason: 'off_duty' };
  if (input.atSite) return { send: false, reason: 'at_site' };
  const ordered = [...input.points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const last = keptPoints(ordered).slice(-ON_WAY_POINTS);
  const newest = last[last.length - 1];
  if (last.length < ON_WAY_POINTS || !newest) return { send: false, reason: 'few_points' };
  if (input.now.getTime() - newest.recordedAt.getTime() > ON_WAY_FRESH_MINUTES * 60_000)
    return { send: false, reason: 'stale' };
  const away = last.map((point) => distanceMeters(point, input.site));
  const closer = away.every(
    (metres, index) => index === 0 || (away[index - 1] ?? 0) - metres > ROUTE_JITTER_FLOOR_M,
  );
  if (!closer) return { send: false, reason: 'not_closer' };
  const distanceM = away[away.length - 1] ?? 0;
  if (distanceM <= input.radiusM) return { send: false, reason: 'there' };
  const minutes = visitEtaMinutes(distanceM);
  if (minutes > ON_WAY_MAX_MINUTES) return { send: false, reason: 'far' };
  return { send: true, minutes, distanceM: Math.round(distanceM) };
}
