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

/** RazorpayX's fee (with GST) comes out of the bank balance as a bank charge. */
export function payoutFeePosting(feePaise: number): JournalLine[] {
  if (feePaise <= 0) return [];
  return [
    { account: ACCOUNT.gatewayFees, debitPaise: feePaise, creditPaise: 0 },
    { account: ACCOUNT.bank, debitPaise: 0, creditPaise: feePaise },
  ];
}
