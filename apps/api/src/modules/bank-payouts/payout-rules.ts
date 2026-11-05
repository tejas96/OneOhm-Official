import type { BankPayout, PayoutOptions } from '@oneohm/api-contracts';
import type { bankPayouts } from '@oneohm/database';
import {
  isLowBalanceFailure,
  isValidAccountNumber,
  isValidIfsc,
  PAYEE_TOLD,
  PAYOUT_PLAIN_REASONS,
  type PayoutStatus,
  payoutPhase,
  payoutProblemReason,
} from '@oneohm/domain';
import type { Payee } from './payees';
import { IP_NOT_ALLOWED_TEXT, LOW_BALANCE_TEXT, NOT_REACHED_TEXT } from './payout-errors';
import { PRACTICE_CLOSED_TEXT } from './payout-reconcile';

type Problem = NonNullable<PayoutOptions['problem']>;

/** What the person sees when a bill cannot go by bank transfer yet. */
export const PROBLEM_TEXT: Readonly<Record<Problem, string>> = {
  not_enabled: 'Bank transfers through RazorpayX are not switched on.',
  not_approved: 'Approve the bill before paying it.',
  no_payee: 'This bill is not linked to a vendor or crew, so pay it outside OneOhm.',
  no_bank_details: 'Add the payee’s bank account name, number and IFSC first.',
  bad_bank_details: 'The payee’s IFSC or account number does not look right.',
  nothing_due: 'Nothing is left to pay on this bill.',
  already_sending: 'A bank transfer for this bill is already on its way.',
  bank_on_hold: 'The payee’s bank details changed recently, so bank transfers wait.',
};

/** The first reason a bill cannot be paid by bank transfer, or null when it can. */
export function problemFor(input: {
  mode: 'off' | 'sandbox' | 'live';
  status: string;
  payee: Payee | null;
  amountPaise: number;
  sending: boolean;
  /** The payee’s bank details changed less than 24 hours ago and nobody released the hold. */
  held: boolean;
}): Problem | null {
  if (input.mode === 'off') return 'not_enabled';
  if (input.status !== 'approved') return 'not_approved';
  if (!input.payee) return 'no_payee';
  const { name, ifsc, accountNumber } = input.payee.bank;
  if (!name || !ifsc || !accountNumber) return 'no_bank_details';
  if (!isValidIfsc(ifsc) || !isValidAccountNumber(accountNumber)) return 'bad_bank_details';
  if (input.held) return 'bank_on_hold';
  if (input.amountPaise <= 0) return 'nothing_due';
  if (input.sending) return 'already_sending';
  return null;
}

/**
 * An old row can hold a leftover "processed" message as its reason. The stored text is run
 * through the same rule as a fresh event, so such a row shows the plain fallback instead.
 */
function cleanReason(row: typeof bankPayouts.$inferSelect): string | null {
  if (!row.failureReason) return null;
  const stored = row.failureReason;
  return payoutProblemReason(
    { details: { description: stored }, failureReason: stored },
    row.status as PayoutStatus,
  ).text;
}

/** OneOhm's own reasons (each says what to do next), as opposed to the bank's words. */
const OWN_REASONS: readonly string[] = [
  ...Object.values(PAYOUT_PLAIN_REASONS),
  LOW_BALANCE_TEXT,
  NOT_REACHED_TEXT,
  IP_NOT_ALLOWED_TEXT,
  PRACTICE_CLOSED_TEXT,
];

export function presentPayout(row: typeof bankPayouts.$inferSelect, payeeName: string): BankPayout {
  const reason = cleanReason(row);
  return {
    id: row.id,
    payableId: row.payableId,
    status: row.status,
    mode: row.mode,
    amountPaise: row.amountPaise,
    feePaise: row.feePaise,
    feeTaxPaise: row.feeTaxPaise,
    utr: row.utr,
    failureReason: reason,
    failureFromBank: reason !== null && !OWN_REASONS.includes(reason),
    failureCode: row.failureCode,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    phase: payoutPhase(row.status, row.providerPayoutId !== null),
    accountMasked: row.accountMasked,
    payeeName,
    paidOn: row.paidOn,
    payeeTold: PAYEE_TOLD.find((told) => told === row.payeeTold) ?? null,
    lowBalance: isLowBalanceFailure(row.failureCode),
    sandbox: row.provider === 'sandbox',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
