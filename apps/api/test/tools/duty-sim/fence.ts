import { distanceM, type LatLng } from './geo';
import type { Timed } from './simulate';

/** What the phone's site fence does: confirm an arrival after 5 minutes inside, then the exit. */
export const DWELL_SEC = 300;
export const ARRIVAL_ACCURACY_M = 100;

export interface FenceEvents {
  /** Index of the reading that confirms the arrival, and when the phone first saw it inside. */
  enter: { confirmIndex: number; enteredAt: string } | null;
  /** Index of the first reading outside after the stay; the exit time is that reading's. */
  exit: { index: number } | null;
}

export function fenceEvents(points: readonly Timed[], site: LatLng, radiusM: number): FenceEvents {
  const inside = (p: Timed) =>
    !p.body.mocked && distanceM(p.body, site) <= radiusM && p.body.accuracyM <= ARRIVAL_ACCURACY_M;
  const first = points.findIndex(inside);
  if (first < 0) return { enter: null, exit: null };
  const entered = points[first] as Timed;
  const confirmIndex = points.findIndex(
    (p, i) => i > first && inside(p) && p.tSec >= entered.tSec + DWELL_SEC,
  );
  if (confirmIndex < 0) return { enter: null, exit: null };
  const exit = points.findIndex(
    (p, i) => i > confirmIndex && !p.body.mocked && distanceM(p.body, site) > radiusM,
  );
  return {
    enter: { confirmIndex, enteredAt: entered.body.recordedAt },
    exit: exit < 0 ? null : { index: exit },
  };
}
