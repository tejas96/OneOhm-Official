import { type PayoutStatus, payoutOpen, type TransferMode } from './bank-payouts';

/**
 * How far a payout has got. RazorpayX events can arrive late or out of order, so a status
 * is applied only when it moves the payout forward (PRD 3.11).
 */
const RANK: Readonly<Record<PayoutStatus, number>> = {
  queued: 0,
  pending: 1,
  processing: 2,
  processed: 3,
  reversed: 4,
  // The payout never happened. These are final, except that RazorpayX may later say processed.
  failed: 3,
  cancelled: 3,
  rejected: 3,
};

export const payoutRank = (status: PayoutStatus): number => RANK[status];

/** It will not arrive and nothing came back: failed, cancelled or rejected. */
export const payoutDead = (status: PayoutStatus): boolean =>
  status === 'failed' || status === 'cancelled' || status === 'rejected';

/**
 * What to do with a status RazorpayX reports for a payout we hold:
 * `apply` it, call it a `repeat` of what we know, or ignore it as `stale` (out of order).
 * RazorpayX's later word wins: a payout we marked failed can still turn out processed.
 */
export function payoutTransition(
  current: PayoutStatus,
  reported: PayoutStatus,
): 'apply' | 'repeat' | 'stale' {
  if (current === reported) return 'repeat';
  if (payoutOpen(current)) {
    // From open, anything ahead of where we are, or a final failure, counts.
    return payoutDead(reported) || RANK[reported] > RANK[current] ? 'apply' : 'stale';
  }
  if (current === 'processed') return reported === 'reversed' ? 'apply' : 'stale';
  if (current === 'reversed') return 'stale';
  return reported === 'processed' ? 'apply' : 'stale';
}

export const PAYOUT_PHASES = ['sending', 'on_its_way', 'paid', 'failed', 'came_back'] as const;
export type PayoutPhase = (typeof PAYOUT_PHASES)[number];

/**
 * The plain-words stage of a payout: still being sent to RazorpayX (no id from them yet),
 * on its way, paid, failed, or paid and then returned.
 */
export function payoutPhase(status: PayoutStatus, hasProviderId: boolean): PayoutPhase {
  if (status === 'processed') return 'paid';
  if (status === 'reversed') return 'came_back';
  if (payoutDead(status)) return 'failed';
  return hasProviderId ? 'on_its_way' : 'sending';
}

/** IMPS should land in minutes; NEFT can take hours, so it gets longer before we worry. */
export const stuckAfterMinutes = (mode: string): number => (mode === 'NEFT' ? 240 : 30);

/** Whether an open payout has taken longer than it should for its transfer mode. */
export function payoutStuck(mode: TransferMode | string, createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > stuckAfterMinutes(mode) * 60_000;
}

/** A payout that never got an id from RazorpayX this long ago did not reach them. */
export const NOT_REACHED_AFTER_MINUTES = 15;

export const payoutNeverReached = (createdAt: Date, now: Date): boolean =>
  now.getTime() - createdAt.getTime() > NOT_REACHED_AFTER_MINUTES * 60_000;
