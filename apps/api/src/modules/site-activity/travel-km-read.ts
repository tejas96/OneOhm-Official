import { type readTravelFacts, type travelDays } from '@oneohm/database';
import { measureDay, type WorkforcePolicy } from '@oneohm/domain';

type Saved = typeof travelDays.$inferSelect;

/** The km facts of a saved day, in the shape the contracts give. */
export const kmOf = (saved: Saved) => ({
  routeM: saved.routeM,
  straightM: saved.straightM,
  paidM: saved.paidM,
  method: saved.method,
  capApplied: saved.capApplied,
  commuteDeductM: saved.commuteDeductM,
  gapCount: saved.gapCount,
  gapMinutes: saved.gapMinutes,
  mockedCount: saved.mockedCount,
});

export function liveMeasure(
  facts: Awaited<ReturnType<typeof readTravelFacts>>,
  policy: WorkforcePolicy,
  visits: number,
) {
  const day = measureDay({
    stops: facts.stops,
    points: facts.route,
    commuteDeductM: Math.round(policy.travel.commuteDeductKm * 1000),
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
      commuteDeductM: day.paid.commuteDeductM,
      gapCount: day.route.gapCount,
      gapMinutes: day.route.gapMinutes,
      mockedCount: day.route.mockedCount,
    },
  };
}
