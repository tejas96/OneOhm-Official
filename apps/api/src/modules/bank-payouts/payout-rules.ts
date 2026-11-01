import type { BankPayout, PayoutOptions } from '@oneohm/api-contracts';
import type { bankPayouts } from '@oneohm/database';
import { isValidAccountNumber, isValidIfsc } from '@oneohm/domain';
import type { Payee } from './payees';

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
};

/** The first reason a bill cannot be paid by bank transfer, or null when it can. */
export function problemFor(input: {
  mode: 'off' | 'sandbox' | 'live';
  status: string;
  payee: Payee | null;
  amountPaise: number;
  sending: boolean;
}): Problem | null {
  if (input.mode === 'off') return 'not_enabled';
  if (input.status !== 'approved') return 'not_approved';
  if (!input.payee) return 'no_payee';
  const { name, ifsc, accountNumber } = input.payee.bank;
  if (!name || !ifsc || !accountNumber) return 'no_bank_details';
  if (!isValidIfsc(ifsc) || !isValidAccountNumber(accountNumber)) return 'bad_bank_details';
  if (input.amountPaise <= 0) return 'nothing_due';
  if (input.sending) return 'already_sending';
  return null;
}

export function presentPayout(row: typeof bankPayouts.$inferSelect): BankPayout {
  return {
    id: row.id,
    payableId: row.payableId,
    status: row.status,
    mode: row.mode,
    amountPaise: row.amountPaise,
    feePaise: row.feePaise,
    utr: row.utr,
    failureReason: row.failureReason,
    accountMasked: row.accountMasked,
    sandbox: row.provider === 'sandbox',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
