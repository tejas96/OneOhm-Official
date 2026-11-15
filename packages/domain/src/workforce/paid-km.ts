/**
 * What a day's km is paid on: the recorded route when there is one, kept between the straight
 * line between the stops (never paid less) and a multiple of it; the straight line when there
 * is no route. A day with no site visit pays nothing, whatever the phone recorded.
 */

/** The ratio cap does not apply below this straight distance: short hops wind more, in metres. */
export const CAP_MIN_STRAIGHT_M = 1000;
/** Under that distance the route is paid up to this many metres in all instead of a ratio. */
export const SHORT_DAY_MAX_PAID_M = 2000;
/** A route needs two usable points to be a route. */
export const ROUTE_MIN_POINTS = 2;

export type PaidMethod = 'route' | 'straight';

export interface PaidKm {
  readonly paidM: number;
  readonly method: PaidMethod;
  /** The route was longer than the cap, so it was cut. */
  readonly capApplied: boolean;
  /** The day has no site visit, so nothing is paid. */
  readonly noVisits: boolean;
  /** Under 1 km straight, so the ratio could not hold the route: only the 2 km limit did. */
  readonly uncappedRoute: boolean;
  /** The route was shorter than the straight line, so the straight line is paid. */
  readonly shortRoute: boolean;
}

const result = (paidM: number, method: PaidMethod, flags: Partial<PaidKm> = {}): PaidKm => ({
  paidM,
  method,
  capApplied: false,
  noVisits: false,
  uncappedRoute: false,
  shortRoute: false,
  ...flags,
});

export function paidKm(input: {
  readonly straightM: number;
  readonly routeM: number;
  /** Usable (kept) route points of the day. */
  readonly keptPoints: number;
  readonly capRatio: number;
  /** Site visits of the day. */
  readonly visits: number;
}): PaidKm {
  if (input.visits <= 0) return result(0, 'straight', { noVisits: true });
  const straightM = Math.max(0, Math.round(input.straightM));
  if (input.keptPoints < ROUTE_MIN_POINTS) return result(straightM, 'straight');
  const routeM = Math.max(0, Math.round(input.routeM));
  const shortRoute = routeM < straightM;
  if (straightM < CAP_MIN_STRAIGHT_M)
    return result(Math.max(straightM, Math.min(routeM, SHORT_DAY_MAX_PAID_M)), 'route', {
      uncappedRoute: true,
      shortRoute,
    });
  const cap = Math.round(straightM * input.capRatio);
  return result(Math.max(straightM, Math.min(routeM, cap)), 'route', {
    capApplied: routeM > cap,
    shortRoute,
  });
}
