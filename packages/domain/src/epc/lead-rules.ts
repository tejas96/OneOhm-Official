/** Why a lead was lost, from a short list; "other" needs a few words (PRD 3.3). */
export const LEAD_LOST_REASONS = [
  'price',
  'competitor',
  'not_interested',
  'no_response',
  'not_feasible',
  'finance',
  'postponed',
  'other',
] as const;
export type LeadLostReason = (typeof LEAD_LOST_REASONS)[number];

export const isLeadLostReason = (value: string): value is LeadLostReason =>
  (LEAD_LOST_REASONS as readonly string[]).includes(value);

/**
 * What is missing when a lead is marked lost: a reason from the list, words for "other",
 * and a revisit day that is not in the past. Null when it is complete.
 */
export function lostLeadProblem(input: {
  readonly reasonKey: string | null;
  readonly reasonText: string | null;
  readonly revisitOn: string | null;
  readonly today: string;
}): {
  readonly field: 'lostReasonKey' | 'lostReason' | 'revisitOn';
  readonly message: string;
} | null {
  if (!input.reasonKey || !isLeadLostReason(input.reasonKey)) {
    return { field: 'lostReasonKey', message: 'Pick why the lead was lost.' };
  }
  if (input.reasonKey === 'other' && !input.reasonText?.trim()) {
    return { field: 'lostReason', message: 'Say in a few words why it was lost.' };
  }
  if (input.revisitOn && input.revisitOn <= input.today) {
    return { field: 'revisitOn', message: 'Pick a day after today to try again.' };
  }
  return null;
}

/** A lost lead whose revisit day has come: it belongs in the owner's follow-ups again. */
export function isRevisitDue(
  lead: { readonly stage: string; readonly revisitOn: string | null },
  today: string,
): boolean {
  return lead.stage === 'lost' && lead.revisitOn !== null && lead.revisitOn <= today;
}

export interface OwnerCandidate {
  readonly userId: string;
  readonly name: string;
  /** Open leads this person already owns. */
  readonly openLeads: number;
  readonly onLeave: boolean;
}

/**
 * Who takes a lead nobody picked (website, WhatsApp, referral, reseller): the person
 * with the fewest open leads, people on leave last, then by name so it never flips.
 */
export function pickLeadOwner(candidates: readonly OwnerCandidate[]): string | null {
  const [first] = [...candidates].sort(
    (left, right) =>
      Number(left.onLeave) - Number(right.onLeave) ||
      left.openLeads - right.openLeads ||
      left.name.localeCompare(right.name) ||
      left.userId.localeCompare(right.userId),
  );
  return first?.userId ?? null;
}
