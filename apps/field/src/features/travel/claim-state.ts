import type { TravelClaim, TravelDay } from '@oneohm/api-contracts';

export type ClaimBoxState = 'claimed' | 'form' | 'end_day' | 'nothing' | 'none';

/**
 * What the claim area of the travel screen shows (live review S5): the claim itself, the
 * form, "End your day to claim" while the day is still running, "nothing to claim" for a
 * closed day with no distance, or nothing on a day with no site visits.
 */
export function claimBoxState(
  day: Pick<TravelDay, 'claim' | 'claimable' | 'closed' | 'visits'>,
): ClaimBoxState {
  const live = day.claim && (day.claim.status === 'pending' || day.claim.status === 'approved');
  if (live) return 'claimed';
  if (day.claimable) return 'form';
  if (day.visits.length === 0) return 'none';
  return day.closed ? 'nothing' : 'end_day';
}

/**
 * Whether the system made or approved the claim, so the person is told it was done for them:
 * approved; waiting for a person (`sent`); or waiting for the morning approval because
 * nothing needs a person to look at it (`ready`).
 */
export function autoNote(
  claim: Pick<TravelClaim, 'autoMade' | 'autoApproved' | 'status' | 'reviewReasons'>,
): 'approved' | 'sent' | 'ready' | null {
  if (!claim.autoMade) return null;
  if (claim.autoApproved) return 'approved';
  if (claim.status !== 'pending') return null;
  return claim.reviewReasons.length === 0 ? 'ready' : 'sent';
}
