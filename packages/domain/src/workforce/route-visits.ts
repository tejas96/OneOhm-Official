import { distanceMeters, type GeoPoint } from './attendance';
import { ambiguousSitesAt, type DutySite } from './duty-sites';

/**
 * The backstop for a phone that missed its site fence (Duty Day step 3): from the day's
 * route points, when the person arrived at one of today's sites and when they left it.
 */

/** A point must be this exact to count. */
export const ROUTE_VISIT_ACCURACY_M = 100;

/** Leaving: two or more kept points in a row, this far apart in time, beyond the fence. */
export const ROUTE_VISIT_SPAN_MS = 4 * 60_000;

/** Arriving: at least this many kept points in a row inside the fence... */
export const ROUTE_ARRIVE_POINTS = 3;

/** ...spanning at least this long... */
export const ROUTE_ARRIVE_SPAN_MS = 5 * 60_000;

/** ...with no longer a silence than this between two of them. */
export const ROUTE_ARRIVE_MAX_GAP_MS = 6 * 60_000;

/** Leaving counts only this far beyond the fence, so a worker at the edge does not flicker. */
export const ROUTE_LEAVE_MARGIN_M = 100;

export interface RouteVisitPoint {
  readonly recordedAt: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM: number | null;
  readonly mocked: boolean;
}

/** The person's open visit, with its site's pin when it has one. */
export interface OpenRouteVisit {
  /** The task or service request the visit is for, when known. */
  readonly siteId: string | null;
  readonly checkInAt: Date;
  readonly site: GeoPoint | null;
  readonly radiusM: number;
}

export type RouteVisitAction =
  | { readonly kind: 'check_in'; readonly site: DutySite; readonly at: Date }
  | { readonly kind: 'check_out'; readonly at: Date };

/** A point to trust: exact enough, and not a fake location. */
export const keptRoutePoint = (point: RouteVisitPoint): boolean =>
  !point.mocked && point.accuracyM !== null && point.accuracyM <= ROUTE_VISIT_ACCURACY_M;

/** The first point of a run of 2+ consecutive kept points beyond `test`, spanning 4 minutes. */
function firstDeparture(
  points: readonly RouteVisitPoint[],
  test: (point: RouteVisitPoint) => boolean,
): RouteVisitPoint | null {
  let run: RouteVisitPoint[] = [];
  for (const point of points) {
    if (!test(point)) {
      run = [];
      continue;
    }
    run.push(point);
    const first = run[0];
    if (first && run.length >= 2 && time(point) - time(first) >= ROUTE_VISIT_SPAN_MS) return first;
  }
  return null;
}

const time = (point: RouteVisitPoint): number => point.recordedAt.getTime();

/**
 * The first point of an arrival: 3+ kept points in a row inside the fence, spanning 5 minutes,
 * no two of them more than 6 minutes apart. Every point of the day is looked at, not just the
 * kept ones: a poor or fake point in the middle breaks the run, since the person may have been
 * driving past with the signal jumping about.
 */
function firstArrival(
  points: readonly RouteVisitPoint[],
  inside: (point: RouteVisitPoint) => boolean,
): RouteVisitPoint | null {
  let run: RouteVisitPoint[] = [];
  for (const point of points) {
    if (!keptRoutePoint(point) || !inside(point)) {
      run = [];
      continue;
    }
    const last = run.at(-1);
    if (last && time(point) - time(last) > ROUTE_ARRIVE_MAX_GAP_MS) run = [];
    run.push(point);
    const first = run[0];
    if (
      first &&
      run.length >= ROUTE_ARRIVE_POINTS &&
      time(point) - time(first) >= ROUTE_ARRIVE_SPAN_MS
    )
      return first;
  }
  return null;
}

/**
 * The points that may start a new visit at a site. After a visit here closed, only those
 * from the first kept point away from the site on, so a person still standing at the site is
 * not checked in again.
 */
function pointsFor(
  rest: readonly RouteVisitPoint[],
  site: DutySite,
  closedAt: number | undefined,
): readonly RouteVisitPoint[] {
  if (closedAt === undefined) return rest;
  const after = rest.filter((point) => time(point) > closedAt);
  const away = after.findIndex(
    (point) =>
      keptRoutePoint(point) && distanceMeters(point, site) > site.radiusM + ROUTE_LEAVE_MARGIN_M,
  );
  return away < 0 ? [] : after.slice(away);
}

/**
 * When the open visit ended by the route, or null. The person must have been seen inside the
 * fence during the visit (a kept point at or after the check-in); only then the first of 2+
 * kept points beyond the fence and its margin, spanning 4 minutes, is the departure.
 */
function departure(
  kept: readonly RouteVisitPoint[],
  open: OpenRouteVisit,
  cursor: number,
): Date | null {
  const { site, radiusM, checkInAt } = open;
  if (!site) return null;
  const during = kept.filter((point) => time(point) >= checkInAt.getTime());
  const seen = during.find((point) => distanceMeters(point, site) <= radiusM);
  if (!seen) return null;
  const left = firstDeparture(
    during.filter((point) => time(point) > cursor && time(point) > time(seen)),
    (point) => distanceMeters(point, site) > radiusM + ROUTE_LEAVE_MARGIN_M,
  );
  return left?.recordedAt ?? null;
}

/** The earliest arrival at any of today's sites among the points after the cursor, or null. */
function arrival(
  rest: readonly RouteVisitPoint[],
  sites: readonly DutySite[],
  closed: ReadonlyMap<string, Date>,
): { site: DutySite; at: Date } | null {
  let best: { site: DutySite; at: Date } | null = null;
  for (const site of sites) {
    const first = firstArrival(
      pointsFor(rest, site, closed.get(site.id)?.getTime()),
      (point) =>
        distanceMeters(point, site) <= site.radiusM &&
        !ambiguousSitesAt(point, sites).some((one) => one.id === site.id),
    );
    if (first && (!best || first.recordedAt < best.at)) best = { site, at: first.recordedAt };
  }
  return best;
}

/**
 * What the route says happened, in order. `points` are the person's points of the day; the
 * state is what is saved: an open visit, the moment their latest visit closed today and when
 * each site's visit closed. Each action starts from the one before it, so a late flush that
 * carries a whole morning gives every arrival and departure in turn. No proof, no action:
 * fewer than three kept points in a row inside the fence over five minutes to arrive, or
 * under two beyond it over four minutes to leave.
 */
export function routeVisitActions(input: {
  readonly points: readonly RouteVisitPoint[];
  readonly sites: readonly DutySite[];
  readonly open: OpenRouteVisit | null;
  /** The latest moment a visit of the person closed today; earlier points are not looked at. */
  readonly closedAt: Date | null;
  /** When the visit at each site (by its id) closed today. */
  readonly closedBySite: ReadonlyMap<string, Date>;
}): RouteVisitAction[] {
  const ordered = [...input.points].sort((a, b) => time(a) - time(b));
  const kept = ordered.filter(keptRoutePoint);
  const actions: RouteVisitAction[] = [];
  const closed = new Map(input.closedBySite);
  let open = input.open;
  let cursor = input.closedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  // Every action moves the cursor forward; the guard only keeps a bad input from looping.
  for (let guard = 0; guard < 50; guard += 1) {
    if (open) {
      const at = departure(kept, open, cursor);
      if (!at) break;
      actions.push({ kind: 'check_out', at });
      cursor = at.getTime();
      if (open.siteId) closed.set(open.siteId, at);
      open = null;
      continue;
    }
    const next = arrival(
      ordered.filter((point) => time(point) > cursor),
      input.sites,
      closed,
    );
    if (!next) break;
    actions.push({ kind: 'check_in', site: next.site, at: next.at });
    cursor = next.at.getTime() - 1;
    open = {
      siteId: next.site.id,
      checkInAt: next.at,
      site: { latitude: next.site.latitude, longitude: next.site.longitude },
      radiusM: next.site.radiusM,
    };
  }
  return actions;
}
