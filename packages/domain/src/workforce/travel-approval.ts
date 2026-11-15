/**
 * Who decides a travel claim (live review S10). Only the person's reporting manager, HR
 * (who manage people) or finance (who record or approve payments), never the claimant, and
 * not just anyone who happens to approve leave.
 */
export const TRAVEL_HR_RIGHT = 'people.manage';
export const TRAVEL_FINANCE_RIGHTS = [
  'finance.record_payments',
  'finance.approve_payments',
] as const;

export type TravelDeciderProblem = 'own' | 'not_allowed';

export interface TravelDecider {
  readonly userId: string;
  readonly capabilities: readonly string[];
}

/** True when the person holds the HR right or a finance right. */
export function isHrOrFinance(capabilities: readonly string[]): boolean {
  return (
    capabilities.includes(TRAVEL_HR_RIGHT) ||
    TRAVEL_FINANCE_RIGHTS.some((right) => capabilities.includes(right))
  );
}

/**
 * Why this person may not decide the claim, or null when they may. `managerIds` is the
 * claimant's active manager plus whoever covers for them today (leave cover still applies).
 */
export function travelDeciderProblem(input: {
  readonly decider: TravelDecider;
  readonly claimantId: string;
  readonly managerIds: readonly string[];
}): TravelDeciderProblem | null {
  const { decider, claimantId, managerIds } = input;
  if (decider.userId === claimantId) return 'own';
  if (managerIds.includes(decider.userId)) return null;
  return isHrOrFinance(decider.capabilities) ? null : 'not_allowed';
}

/**
 * Everyone who may decide the claim, for the approvals list: the manager (and cover) first,
 * then HR and finance. The claimant is never one of them.
 */
export function travelClaimReviewers(input: {
  readonly claimantId: string;
  readonly managerIds: readonly string[];
  readonly hrIds: readonly string[];
  readonly financeIds: readonly string[];
}): readonly string[] {
  const all = [...input.managerIds, ...input.hrIds, ...input.financeIds];
  return [...new Set(all)].filter((id) => id !== input.claimantId);
}

/** Why a claim cannot be voided, or null when it can: approved, not paid, no bank transfer on its way. */
export function travelVoidProblem(input: {
  readonly status: string;
  readonly payableStatus: string | null;
  readonly payoutOpen: boolean;
  readonly reason: string;
}): 'reason' | 'not_approved' | 'paid' | 'payout_open' | null {
  if (input.reason.trim().length === 0) return 'reason';
  if (input.status !== 'approved') return 'not_approved';
  if (input.payableStatus === 'paid') return 'paid';
  if (input.payoutOpen) return 'payout_open';
  return null;
}
