import type { CableRoute, CableRouteKind, SiteSetup } from './costing-card';
import { type CableRunInput, type PricedRun, type RateNeed, round2 } from './costing-detail';

const BP = 10_000;

export interface CableEstimateInput {
  readonly site: SiteSetup;
  readonly floors: number;
  readonly wastageBp: number;
  /** Total cable measured for a kind of route (the quick quote's DC and AC fields). */
  readonly measured?: Partial<Record<CableRouteKind, number>> | undefined;
  /** Runs measured route by route; a kind measured here replaces its defaults. */
  readonly runs?: readonly CableRunInput[] | undefined;
}

/**
 * Cable runs (PRD 3.9 A). Before the survey each route comes from the site type: across
 * the roof plus a drop per floor, times the cables sharing it. A kind of route measured
 * run by run, or as a total, replaces its defaults; the other kinds stay estimates.
 * Wastage is added to every metre.
 */
export function cableRuns(input: CableEstimateInput): PricedRun[] {
  const waste = 1 + input.wastageBp / BP;
  const runs = input.runs ?? [];
  const measuredKinds = new Set(runs.map((run) => run.kind));
  const priced: PricedRun[] = [];
  for (const run of runs) {
    const fallback = input.site.routes.find((route) => route.kind === run.kind);
    const cable = run.cable ?? fallback?.cable;
    if (!cable) continue;
    const length = run.acrossM + run.upM;
    priced.push({
      kind: run.kind,
      cable,
      routing: run.routing === undefined ? (fallback?.routing ?? null) : run.routing,
      floor: run.floor ?? null,
      acrossM: run.acrossM,
      upM: run.upM,
      runs: run.runs,
      cableM: round2(length * run.runs * waste),
      routeM: round2(length * waste),
      basis: 'survey',
    });
  }
  const totalUsed = new Set<CableRouteKind>();
  for (const route of input.site.routes) {
    if (measuredKinds.has(route.kind)) continue;
    const total = input.measured?.[route.kind];
    if (total !== undefined && total > 0) {
      // A measured total covers every route of its kind: the first carries it.
      if (totalUsed.has(route.kind)) continue;
      totalUsed.add(route.kind);
      priced.push(fromTotal(route, total, waste));
      continue;
    }
    priced.push(fromDefault(route, input.floors, waste));
  }
  return priced;
}

function fromDefault(route: CableRoute, floors: number, waste: number): PricedRun {
  const upM = route.upPerFloorM * floors;
  const length = route.acrossM + upM;
  return {
    kind: route.kind,
    cable: route.cable,
    routing: route.routing,
    floor: null,
    acrossM: route.acrossM,
    upM,
    runs: route.runs,
    cableM: round2(length * route.runs * waste),
    routeM: round2(length * waste),
    basis: 'default',
  };
}

function fromTotal(route: CableRoute, totalM: number, waste: number): PricedRun {
  const runs = Math.max(1, route.runs);
  return {
    kind: route.kind,
    cable: route.cable,
    routing: route.routing,
    floor: null,
    acrossM: round2(totalM / runs),
    upM: 0,
    runs,
    cableM: round2(totalM * waste),
    routeM: round2((totalM / runs) * waste),
    basis: 'survey',
  };
}

/** Cable cost = Σ measured length × rate per metre: one need per cable and per routing. */
export function cableNeeds(runs: readonly PricedRun[]): RateNeed[] {
  return runs.flatMap((run) => [
    { rate: run.cable, quantity: run.cableM, basis: run.basis },
    ...(run.routing ? [{ rate: run.routing, quantity: run.routeM, basis: run.basis }] : []),
  ]);
}
