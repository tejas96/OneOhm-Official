import { ACCOUNT } from './ledger-accounts';
import type { JournalLine } from './ledger-postings';

/**
 * Paying vendors and crews straight from OneOhm through RazorpayX (PRD 3.11). A payout
 * moves through Razorpay's statuses; only "processed" means the money reached them.
 */
export const PAYOUT_STATUSES = [
  'queued',
  'pending',
  'processing',
  'processed',
  'reversed',
  'failed',
  'cancelled',
  'rejected',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const isPayoutStatus = (value: string): value is PayoutStatus =>
  (PAYOUT_STATUSES as readonly string[]).includes(value);

/** The money reached the payee: the bill is paid. */
export const payoutSucceeded = (status: PayoutStatus): boolean => status === 'processed';

/** It will not arrive: the bill stays to pay and can be paid again. */
export const payoutFailed = (status: PayoutStatus): boolean =>
  status === 'reversed' || status === 'failed' || status === 'cancelled' || status === 'rejected';

export const payoutOpen = (status: PayoutStatus): boolean =>
  !payoutSucceeded(status) && !payoutFailed(status);

/** IMPS is instant up to ₹5 lakh; larger amounts go by NEFT. */
export const IMPS_LIMIT_PAISE = 5_00_000_00;
export type TransferMode = 'IMPS' | 'NEFT';

export const transferMode = (amountPaise: number): TransferMode =>
  amountPaise <= IMPS_LIMIT_PAISE ? 'IMPS' : 'NEFT';

/** An Indian bank branch code, for example SBIN0001234. */
export const isValidIfsc = (ifsc: string): boolean => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);

/** Indian bank account numbers are 9 to 18 digits. */
export const isValidAccountNumber = (number: string): boolean => /^\d{9,18}$/.test(number);

/** Only the last four digits are ever shown. */
export function maskAccount(number: string): string {
  const digits = number.replace(/\D/g, '');
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
}

/**
 * RazorpayX's fee comes out of the bank balance. `feePaise` is the whole fee including GST;
 * `taxPaise` is the GST part. The rest is a bank charge (expense) and the GST goes to the
 * input credit account. The bank pays the full fee. A refund is the mirror image.
 */
export function payoutFeePosting(feePaise: number, taxPaise = 0): JournalLine[] {
  if (feePaise <= 0) return [];
  const tax = Math.min(Math.max(taxPaise, 0), feePaise);
  const lines: JournalLine[] = [
    { account: ACCOUNT.gatewayFees, debitPaise: feePaise - tax, creditPaise: 0 },
    { account: ACCOUNT.gstInput, debitPaise: tax, creditPaise: 0 },
    { account: ACCOUNT.bank, debitPaise: 0, creditPaise: feePaise },
  ];
  return lines.filter((line) => line.debitPaise > 0 || line.creditPaise > 0);
}

/**
 * True when a payout failed for lack of money in the RazorpayX balance. `code` is our own
 * `low_balance`, or the reason RazorpayX gives in `status_details` (for example
 * `insufficient_balance`). The one place that decides this, so every screen agrees.
 */
export const isLowBalanceFailure = (code: string | null | undefined): boolean =>
  !!code && /^low_balance$|insufficient|not_enough_balance|balance_low/i.test(code);

/** Whether the payee was told by WhatsApp that they were paid: sent, switched off, or no phone. */
export const PAYEE_TOLD = ['sent', 'off', 'no_phone'] as const;
export type PayeeTold = (typeof PAYEE_TOLD)[number];
