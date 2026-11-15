import type { PaidMethod } from './paid-km';

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
  | 'start_outside_office'
  | 'end_outside_office'
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
  /** The check-in or check-out was not at an office, so that end of the day is not a known place. */
  readonly startOutsideOffice?: boolean;
  readonly endOutsideOffice?: boolean;
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
  if (facts.startOutsideOffice) reasons.push('start_outside_office');
  if (facts.endOutsideOffice) reasons.push('end_outside_office');
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
  start_outside_office: 'The day was started away from an office.',
  end_outside_office: 'The day was ended away from an office.',
  on_leave: 'The person was on leave this day.',
  auto_approve_off: 'Automatic approval is switched off.',
};
