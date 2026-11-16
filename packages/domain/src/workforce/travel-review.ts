import type { PaidMethod } from './paid-km';
import type { StartPlace } from './travel-start';

/**
 * Whether a day's travel claim can be approved by the system, or needs a person (Duty Day
 * step 2). Every reason that sends it to a person is returned, so the approver reads them all.
 */
export type ReviewReason =
  | 'route_gap'
  | 'fake_gps'
  | 'cap_applied'
  | 'far_check_in'
  | 'visit_no_location'
  | 'auto_closed'
  | 'delayed_tap'
  | 'over_km'
  | 'over_amount'
  | 'no_route'
  | 'no_visits'
  | 'uncapped_route'
  | 'short_route'
  | 'far_from_base'
  | 'start_unknown_place'
  | 'end_unknown_place'
  | 'start_unknown'
  | 'end_unknown'
  | 'on_leave'
  | 'auto_approve_off';

/** Silence longer than this, in total, needs a look, in minutes. */
export const AUTO_APPROVE_MAX_GAP_MINUTES = 30;

export interface AutoApproveRules {
  readonly autoApprove: boolean;
  readonly autoApproveMaxKm: number;
  readonly autoApproveMaxPaise: number;
}

export interface DayFacts {
  readonly method: PaidMethod;
  readonly gapMinutes: number;
  readonly mockedCount: number;
  readonly capApplied: boolean;
  /** No site visit that day: nothing to pay. */
  readonly noVisits?: boolean;
  /** The day was under 1 km straight, so only the 2 km limit held the route. */
  readonly uncappedRoute?: boolean;
  /** The route was shorter than the straight line, so the straight line was paid. */
  readonly shortRoute?: boolean;
  /** Where the duty started, against the person's base and the offices (`startPlaceCheck`). */
  readonly startPlace?: StartPlace | 'missing' | undefined;
  /** Where the duty ended, judged the same way; 'missing' when the day has visits but no end position. */
  readonly endPlace?: StartPlace | 'missing' | undefined;
  /** Site visits whose check-in was farther than allowed from the site. */
  readonly farCheckIns: number;
  /** Site visits with no location at check-in: nothing proves where they were. */
  readonly unlocatedVisits: number;
  readonly autoClosed: boolean;
  readonly delayedTap: boolean;
  readonly paidM: number;
  readonly amountPaise: number;
  readonly onLeave: boolean;
}

export interface AutoReview {
  readonly approve: boolean;
  readonly reasons: readonly ReviewReason[];
}

/** The reasons from where the duty started and ended (`startPlaceCheck`), in reading order. */
function placeReasons(facts: DayFacts): ReviewReason[] {
  const { startPlace, endPlace } = facts;
  const reasons: ReviewReason[] = [];
  if (startPlace === 'far_from_base') reasons.push('far_from_base');
  if (startPlace === 'unknown_place') reasons.push('start_unknown_place');
  if (startPlace === 'missing') reasons.push('start_unknown');
  if (endPlace === 'far_from_base' || endPlace === 'unknown_place')
    reasons.push('end_unknown_place');
  if (endPlace === 'missing') reasons.push('end_unknown');
  return reasons;
}

export function reviewTravelDay(facts: DayFacts, rules: AutoApproveRules): AutoReview {
  const reasons: ReviewReason[] = [];
  if (!rules.autoApprove) reasons.push('auto_approve_off');
  if (facts.method !== 'route') reasons.push('no_route');
  if (facts.gapMinutes > AUTO_APPROVE_MAX_GAP_MINUTES) reasons.push('route_gap');
  if (facts.mockedCount > 0) reasons.push('fake_gps');
  if (facts.capApplied) reasons.push('cap_applied');
  if (facts.noVisits) reasons.push('no_visits');
  if (facts.uncappedRoute) reasons.push('uncapped_route');
  if (facts.shortRoute) reasons.push('short_route');
  reasons.push(...placeReasons(facts));
  if (facts.farCheckIns > 0) reasons.push('far_check_in');
  if (facts.unlocatedVisits > 0) reasons.push('visit_no_location');
  if (facts.autoClosed) reasons.push('auto_closed');
  if (facts.delayedTap) reasons.push('delayed_tap');
  if (facts.paidM > rules.autoApproveMaxKm * 1000) reasons.push('over_km');
  if (facts.amountPaise > rules.autoApproveMaxPaise) reasons.push('over_amount');
  if (facts.onLeave) reasons.push('on_leave');
  return { approve: reasons.length === 0, reasons };
}

/** The plain words an approver reads for each reason. */
export const REVIEW_REASON_TEXT: Readonly<Record<ReviewReason, string>> = {
  route_gap: 'The phone sent no location for a long stretch.',
  fake_gps: 'A fake or mock location was reported.',
  cap_applied: 'The route was much longer than the straight line, so it was cut.',
  far_check_in: 'A site check-in was far from the site.',
  visit_no_location: 'A site visit has no location.',
  auto_closed: 'The day was ended by the system, not by the person.',
  delayed_tap: 'A check-in or check-out reached the server late.',
  over_km: 'More km than the automatic limit.',
  over_amount: 'More money than the automatic limit.',
  no_route: 'No route was recorded, so this is a straight-line distance.',
  no_visits: 'There was no site visit that day.',
  uncapped_route:
    'The day was under 1 km in a straight line, so the route was not held to the usual cap.',
  short_route:
    'The recorded route was shorter than the straight line, so the straight line is paid.',
  far_from_base:
    'The day started far from the person’s home or base place and far from every office.',
  start_unknown_place:
    'The day started away from every office and the person has no home or base place saved.',
  end_unknown_place:
    'The day ended far from the person’s home or base place and far from every office.',
  start_unknown: 'The day has site visits but no start position, so its start cannot be checked.',
  end_unknown: 'The day has site visits but no end position, so its end cannot be checked.',
  on_leave: 'The person was on leave this day.',
  auto_approve_off: 'Automatic approval is switched off.',
};
