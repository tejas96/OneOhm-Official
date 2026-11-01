import type { CostingCard, SiteSetup, TravelSetup } from './costing-card';
import type { CostingDetail, RateNeed, UsedDetail } from './costing-detail';
import type { QuantityBasis } from './quote-pricing';

export interface LabourInput {
  readonly card: CostingCard;
  readonly site: SiteSetup;
  readonly kw: number;
  readonly floors: number;
  readonly distanceKm: number;
  readonly detail?: CostingDetail | undefined;
}

export interface LabourEstimate {
  readonly needs: readonly RateNeed[];
  readonly used: Pick<
    UsedDetail,
    'crew' | 'days' | 'visits' | 'access' | 'equipment' | 'tripPaise'
  >;
}

/** Days on site: what the quotation says, else the crew's pace in half days, at least the minimum. */
export function crewDays(site: SiteSetup, kw: number, days?: number): number {
  if (days !== undefined) return days;
  if (site.kwPerDay <= 0) return site.minDays;
  return Math.max(site.minDays, Math.ceil((kw / site.kwPerDay) * 2) / 2);
}

/** One trip from base: the flat charge covers the first kilometres, then per km. */
export function tripPaise(travel: TravelSetup, distanceKm: number): number {
  return travel.flatPaise + Math.max(0, distanceKm - travel.baseKm) * travel.perKmPaise;
}

/**
 * Labour, equipment and travel (PRD 3.9 B): each crew member's person-days, extra effort
 * per kW for each floor above the free floors, equipment the site needs from its floor up,
 * and the visits. Travel is charged once per visit on its own line, never inside labour.
 * Site access is applied by the engine to every labour line.
 */
export function labourEstimate(input: LabourInput): LabourEstimate {
  const { card, site, kw, floors, detail } = input;
  const crew = detail?.crew ?? site.crew;
  const days = crewDays(site, kw, detail?.days);
  const crewBasis: QuantityBasis =
    detail?.crew || detail?.days !== undefined ? 'survey' : 'default';
  const needs: RateNeed[] = crew.map((member) => ({
    rate: member.rate,
    quantity: member.workers * days,
    basis: crewBasis,
  }));
  const above = Math.max(0, floors - card.extraFloor.freeFloors);
  if (card.extraFloor.rate && above > 0) {
    needs.push({ rate: card.extraFloor.rate, quantity: kw * above, basis: 'default' });
  }
  const equipment =
    detail?.equipment ??
    site.equipment
      .filter((rule) => floors >= rule.fromFloor)
      .map((rule) => ({ rate: rule.rate, qty: rule.qty }));
  const equipmentBasis: QuantityBasis = detail?.equipment ? 'survey' : 'default';
  for (const item of equipment) {
    needs.push({ rate: item.rate, quantity: item.qty, basis: equipmentBasis });
  }
  return {
    needs,
    used: {
      crew,
      days,
      visits: detail?.visits ?? card.travel.visits,
      access: detail?.access ?? 'easy',
      equipment,
      tripPaise: tripPaise(card.travel, input.distanceKm),
    },
  };
}
