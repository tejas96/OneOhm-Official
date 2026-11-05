import type { BankPayout, Payable, PayoutSetup } from '@oneohm/api-contracts';
import type { PillTone } from '@oneohm/design-system/web';
import { ApiError, describeError } from '@/lib/api/api-error';

/** The one status a bill shows in the list (spec U2). */
export type BillStatus =
  | 'pending'
  | 'toPay'
  | 'sending'
  | 'partPaid'
  | 'paid'
  | 'cameBack'
  | 'failed';

export const BILL_TONE: Readonly<Record<BillStatus, PillTone>> = {
  pending: 'review',
  toPay: 'onTrack',
  sending: 'waiting',
  partPaid: 'review',
  paid: 'done',
  cameBack: 'atRisk',
  failed: 'overdue',
};

/** True while a bank transfer is with the bank (ours or theirs): pay must stay locked. */
export const payoutIsOpen = (payout: BankPayout | null | undefined): boolean =>
  payout?.phase === 'sending' || payout?.phase === 'on_its_way';

/** One word for a bill: its own state, then what its newest bank transfer did. */
export function billStatus(
  bill: Pick<Payable, 'status' | 'paidPaise'>,
  latest?: BankPayout | null,
) {
  if (bill.status === 'pending') return 'pending';
  if (bill.status === 'paid') return 'paid';
  // A practice transfer closed when transfers went live: no bank was involved, so it says nothing.
  if (latest?.failureCode === 'practice_closed') return bill.paidPaise > 0 ? 'partPaid' : 'toPay';
  if (payoutIsOpen(latest)) return 'sending';
  if (latest?.phase === 'came_back') return 'cameBack';
  if (latest?.phase === 'failed') return 'failed';
  return bill.paidPaise > 0 ? 'partPaid' : 'toPay';
}

/** The newest payout of each bill. */
export function latestByBill(payouts: readonly BankPayout[]): ReadonlyMap<string, BankPayout> {
  const map = new Map<string, BankPayout>();
  for (const payout of payouts) if (!map.has(payout.payableId)) map.set(payout.payableId, payout);
  return map;
}

/** Add-money banner (U8): the last low-balance failure is newer than the last good payout. */
export function lowBalanceBanner(
  setup: Pick<PayoutSetup, 'lastLowBalanceAt' | 'lastGoodPayoutAt'> | undefined,
): boolean {
  if (!setup?.lastLowBalanceAt) return false;
  if (!setup.lastGoodPayoutAt) return true;
  return new Date(setup.lastLowBalanceAt).getTime() > new Date(setup.lastGoodPayoutAt).getTime();
}

/** Two names for the same account differ only by case or spacing: show one. */
export const sameName = (a: string | null, b: string): boolean =>
  (a ?? '').trim().toLowerCase().replace(/\s+/g, ' ') ===
  b.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The line to show under the send form for a failed send. The newest transfer already says
 * the same thing in its own box above (low balance, or the bank's reason), so those
 * errors are left out here: one message, shown once.
 */
export function sendErrorLine(
  error: unknown,
  latest: BankPayout | null | undefined,
): string | null {
  if (error === null || error === undefined) return null;
  const code = error instanceof ApiError ? error.code : undefined;
  const shownAbove =
    code === 'low_balance' ||
    latest?.lowBalance === true ||
    (code === 'payout_failed' && latest?.phase === 'failed');
  return shownAbove ? null : describeError(error);
}
