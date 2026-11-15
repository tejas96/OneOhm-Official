import {
  type DatabaseExecutor,
  readRoute,
  type readTravelFacts,
  type travelDays,
} from '@oneohm/database';
import { measureDay, type WorkforcePolicy } from '@oneohm/domain';

type Saved = typeof travelDays.$inferSelect;

/** The km facts of a saved day, in the shape the contracts give. */
export const kmOf = (saved: Saved) => ({
  routeM: saved.routeM,
  straightM: saved.straightM,
  paidM: saved.paidM,
  method: saved.method,
  capApplied: saved.capApplied,
  gapCount: saved.gapCount,
  gapMinutes: saved.gapMinutes,
  mockedCount: saved.mockedCount,
});

export async function liveMeasure(
  db: DatabaseExecutor,
  facts: Awaited<ReturnType<typeof readTravelFacts>>,
  policy: WorkforcePolicy,
  visits: number,
) {
  const day = measureDay({
    stops: facts.stops,
    points: await readRoute(db, facts.dayId),
    ratePaisePerKm: policy.travel.ratePaisePerKm,
    visits,
    capRatio: policy.travel.routeCapRatio,
  });
  return {
    summary: { ...day.summary, distanceM: day.paid.paidM },
    km: {
      routeM: day.route.routeM,
      straightM: day.summary.distanceM,
      paidM: day.paid.paidM,
      method: day.paid.method,
      capApplied: day.paid.capApplied,
      gapCount: day.route.gapCount,
      gapMinutes: day.route.gapMinutes,
      mockedCount: day.route.mockedCount,
    },
  };
}
