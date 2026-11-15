import { distanceMeters } from './attendance';

/**
 * The day's km from the recorded duty route (Duty Day step 2): bad points are removed,
 * standing still adds nothing, and a silence is bridged with a straight line and counted.
 * Pure: the caller hands over the day's points in time order.
 */

/** A reading worse than this is too vague to measure with, in metres. */
export const ROUTE_MAX_ACCURACY_M = 100;
/** Faster than this between two kept points is a jump, not a drive, in km/h. */
export const ROUTE_TELEPORT_KMH = 150;
/** A move shorter than this is jitter even when both readings are sharp, in metres. */
export const ROUTE_JITTER_FLOOR_M = 25;
/** Two kept points farther apart in time than this are a gap, in minutes. */
export const ROUTE_GAP_MINUTES = 20;

export interface RoutePoint {
  readonly recordedAt: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM: number | null;
  readonly mocked: boolean;
}

export interface RouteKm {
  /** Metres along the kept points, gaps bridged in a straight line. */
  readonly routeM: number;
  readonly gapCount: number;
  /** Total minutes of silence over all gaps. */
  readonly gapMinutes: number;
  readonly mockedCount: number;
  readonly keptPoints: number;
  /** Every point not used: mocked, too vague, or a jump. */
  readonly droppedPoints: number;
}

type Verdict = 'mocked' | 'vague' | 'jump' | 'ok';

/** Whether a point can be measured with, given the last point that could. */
function judge(point: RoutePoint, previous: RoutePoint | null): Verdict {
  if (point.mocked) return 'mocked';
  if (point.accuracyM !== null && point.accuracyM > ROUTE_MAX_ACCURACY_M) return 'vague';
  if (!previous) return 'ok';
  const seconds = Math.max(1, (point.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000);
  return (distanceMeters(previous, point) / seconds) * 3.6 > ROUTE_TELEPORT_KMH ? 'jump' : 'ok';
}

/** A move shorter than this is the phone wobbling, not the person moving. */
const jitterLimit = (a: RoutePoint, b: RoutePoint): number =>
  Math.max(ROUTE_JITTER_FLOOR_M, ((a.accuracyM ?? 0) + (b.accuracyM ?? 0)) / 2);

/** Readings in a row that must disagree with a first point for it to be called the bad one. */
const BAD_START_RUN = 3;

const jumps = (from: RoutePoint, to: RoutePoint): boolean => judge(to, from) === 'jump';

/**
 * A first usable point that is itself the jump (a stale or wrong first fix): when at least
 * three readings after it agree with each other and every one of them is a teleport away from
 * it, the point is wrong and the route starts from those readings instead. Returns its index.
 */
function badFirstPoint(points: readonly RoutePoint[]): number {
  const usable = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => judge(point, null) === 'ok');
  const first = usable[0];
  if (!first) return -1;
  let run = 0;
  let last: RoutePoint | null = null;
  for (const { point } of usable.slice(1)) {
    if (!jumps(first.point, point) || (last && jumps(last, point))) break;
    run += 1;
    last = point;
  }
  return run >= BAD_START_RUN ? first.index : -1;
}

/** The time the person was on duty: silence before the first and after the last kept reading is a gap too. */
export interface RouteWindow {
  readonly from: Date;
  readonly to: Date | null;
}

/** Minutes of silence from check-in to the first kept point and from the last one to check-out. */
function edgeSilences(
  window: RouteWindow | null | undefined,
  first: RoutePoint | null,
  last: RoutePoint | null,
): number[] {
  if (!window || !first || !last) return [];
  const minutes = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;
  const edges = [minutes(window.from, first.recordedAt)];
  if (window.to) edges.push(minutes(last.recordedAt, window.to));
  return edges.filter((silent) => silent > ROUTE_GAP_MINUTES);
}

export function routeKm(points: readonly RoutePoint[], window?: RouteWindow | null): RouteKm {
  const badStart = badFirstPoint(points);
  let routeM = 0;
  let gapCount = 0;
  let gapMinutes = 0;
  let mockedCount = 0;
  let kept = 0;
  let previous: RoutePoint | null = null;
  let anchor: RoutePoint | null = null;
  let first: RoutePoint | null = null;
  const addGap = (silentMinutes: number) => {
    gapCount += 1;
    gapMinutes += Math.round(silentMinutes);
  };
  for (const [index, point] of points.entries()) {
    const verdict = index === badStart ? 'jump' : judge(point, previous);
    if (verdict === 'mocked') mockedCount += 1;
    if (verdict !== 'ok') continue;
    kept += 1;
    first ??= point;
    if (previous && anchor) {
      const silent = (point.recordedAt.getTime() - previous.recordedAt.getTime()) / 60_000;
      const length = distanceMeters(anchor, point);
      if (silent > ROUTE_GAP_MINUTES) {
        addGap(silent);
        routeM += distanceMeters(previous, point);
        anchor = point;
      } else if (length > jitterLimit(anchor, point)) {
        routeM += length;
        anchor = point;
      }
    } else anchor = point;
    previous = point;
  }
  for (const silent of edgeSilences(window, first, previous)) addGap(silent);
  return {
    routeM: Math.round(routeM),
    gapCount,
    gapMinutes,
    mockedCount,
    keptPoints: kept,
    droppedPoints: points.length - kept,
  };
}
