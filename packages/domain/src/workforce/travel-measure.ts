import { type PaidKm, paidKm } from './paid-km';
import { type RouteKm, type RoutePoint, type RouteWindow, routeKm } from './route-km';
import { summariseTravel, type TravelStop, type TravelSummary } from './travel';

export interface DayMeasure {
  /** Legs, visit count and rate, with `distanceM` the straight-line total between the stops. */
  readonly summary: TravelSummary;
  readonly route: RouteKm;
  readonly paid: PaidKm;
  /** Every route point the day has, used or not. */
  readonly pointsCount: number;
}

/** One day's travel: straight lines between the stops, the recorded route, and what is paid. */
export function measureDay(input: {
  readonly stops: readonly TravelStop[];
  readonly points: readonly RoutePoint[];
  readonly ratePaisePerKm: number;
  readonly visits: number;
  readonly capRatio: number;
  /** Check-in and check-out, so silence at either end counts as a gap. */
  readonly window?: RouteWindow | null;
}): DayMeasure {
  const summary = summariseTravel(input.stops, input.ratePaisePerKm, input.visits);
  const route = routeKm(input.points, input.window);
  const paid = paidKm({
    straightM: summary.distanceM,
    routeM: route.routeM,
    keptPoints: route.keptPoints,
    capRatio: input.capRatio,
    visits: input.visits,
  });
  return { summary, route, paid, pointsCount: input.points.length };
}
