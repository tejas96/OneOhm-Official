import type { LeadAssignmentRules } from '../settings/lead-assignment';

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
  /** On leave today (approved leave or marked away): never given a new lead. */
  readonly away: boolean;
  /** When this person was last given a lead by the rule; null if never. */
  readonly lastLeadAt: Date | null;
}

const byName = (left: OwnerCandidate, right: OwnerCandidate) =>
  left.name.localeCompare(right.name) || left.userId.localeCompare(right.userId);

function pickByStrategy(pool: readonly OwnerCandidate[], rules: LeadAssignmentRules) {
  const time = (person: OwnerCandidate) => person.lastLeadAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const [first] = [...pool].sort((left, right) =>
    rules.strategy === 'round_robin'
      ? Math.sign(time(left) - time(right)) || byName(left, right)
      : left.openLeads - right.openLeads || byName(left, right),
  );
  return first?.userId ?? null;
}

const cityKey = (city: string) => city.trim().toLowerCase();

/**
 * Who takes a lead nobody picked: people who are away are skipped. The city's owners
 * come first when any of them is free; otherwise everyone free shares the lead by the
 * strategy (fewest open leads, or longest since their last lead), then by name so it
 * never flips. Null when everyone is away.
 */
export function pickLeadOwner(
  candidates: readonly OwnerCandidate[],
  rules: LeadAssignmentRules,
  city?: string | null,
): string | null {
  const free = candidates.filter((person) => !person.away);
  const key = city ? cityKey(city) : '';
  const owners = new Set(
    key
      ? rules.cityOwners
          .filter((owner) => owner.cities.some((name) => cityKey(name) === key))
          .map((owner) => owner.userId)
      : [],
  );
  const local = free.filter((person) => owners.has(person.userId));
  return pickByStrategy(local.length > 0 ? local : free, rules);
}
