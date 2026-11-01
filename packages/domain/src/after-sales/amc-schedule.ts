import { addDays, daysBetween } from '@oneohm/shared';
import { addMonths } from './warranty';

/** How an annual maintenance contract runs (PRD 3.17): its length and visits a year. */
export interface AmcTerms {
  readonly visitsPerYear: number;
  readonly durationMonths: number;
}

/** A visit becomes a service request this many days before it is due. */
export const VISIT_LEAD_DAYS = 7;

export const MAX_VISITS_PER_YEAR = 12;
export const MAX_AMC_MONTHS = 120;

/** The last day the contract covers. */
export function amcEndsOn(startsOn: string, durationMonths: number): string {
  return addDays(addMonths(startsOn, durationMonths), -1);
}

/** Visits over the whole contract: a 2-year plan with 4 a year has 8. */
export function visitCount(terms: AmcTerms): number {
  if (terms.visitsPerYear <= 0 || terms.durationMonths <= 0) return 0;
  return Math.max(1, Math.round((terms.visitsPerYear * terms.durationMonths) / 12));
}

/**
 * Visit dates spread evenly across the contract: the period is cut into equal parts and
 * each visit falls in the middle of its part, so none lands on the first or last day.
 */
export function scheduleVisits(startsOn: string, endsOn: string, count: number): string[] {
  const days = daysBetween(startsOn, endsOn) + 1;
  if (count <= 0 || days <= 0) return [];
  const slot = days / count;
  return Array.from({ length: count }, (_, index) =>
    addDays(startsOn, Math.floor(slot * (index + 0.5))),
  );
}

export interface PlannedVisit {
  readonly dueOn: string;
  /** True once the visit has its service request. */
  readonly opened: boolean;
}

/**
 * Visits to open as service requests today: due within the lead window and not yet
 * opened. A visit whose day has passed is left alone; the team sees it on the contract.
 */
export function visitsToOpen<T extends PlannedVisit>(visits: readonly T[], today: string): T[] {
  const until = addDays(today, VISIT_LEAD_DAYS);
  return visits.filter((visit) => !visit.opened && visit.dueOn >= today && visit.dueOn <= until);
}

export type AmcState = 'upcoming' | 'active' | 'ended' | 'cancelled';

export function amcState(
  contract: { readonly startsOn: string; readonly endsOn: string; readonly cancelled: boolean },
  today: string,
): AmcState {
  if (contract.cancelled) return 'cancelled';
  if (today < contract.startsOn) return 'upcoming';
  return today > contract.endsOn ? 'ended' : 'active';
}
