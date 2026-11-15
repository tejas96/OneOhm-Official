import type { TravelDay } from '@oneohm/api-contracts';

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
