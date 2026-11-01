import { ACCOUNT, type LedgerAccountCode } from './ledger-accounts';
import { cashAccountFor, type JournalLine, type MoneyInMethod } from './ledger-postings';
import type { Payer } from './payment-milestones';

/**
 * Customer credit and refunds (PRD 3.11 "Refunds and excess amounts").
 *
 * The design keeps one liability account, 2110 Customer credit, for money OneOhm holds
 * that no milestone asked for (today: an online payment above what was owed):
 *
 *   excess arrives     Dr Gateway clearing / bank   Cr Customer credit
 *   applied later      Dr Customer credit           Cr Receivable (due) or Advances (not due)
 *   refunded           Dr Customer credit           Cr Bank / cash / gateway
 *
 * Money already allocated to a milestone can also be refunded. That reduces what is paid
 * on the milestone (it reopens), so the refund comes out of where the payment went:
 *
 *   refunded           Dr Receivable (due) or Advances (not due)   Cr Bank / cash / gateway
 *
 * Revenue and GST are never touched here: they follow the milestones, and a change to
 * the price itself needs a credit note, which the accountant decides on.
 */
export type RefundMethod = 'cash' | 'cheque' | 'bank_transfer' | 'upi' | 'razorpay';

/** Where a refund's money had been sitting in the books. */
export type RefundSource =
  | { readonly from: 'credit' }
  | { readonly from: 'milestone'; readonly payer: Payer; readonly milestoneDue: boolean };

const line = (account: LedgerAccountCode, debitPaise: number, creditPaise: number) => ({
  account,
  debitPaise,
  creditPaise,
});

/** Money received that nothing was owed for: held for the customer as credit. */
export function customerCreditPosting(input: {
  readonly method: MoneyInMethod;
  readonly amountPaise: number;
}): JournalLine[] {
  return [
    line(cashAccountFor(input.method), input.amountPaise, 0),
    line(ACCOUNT.customerCredit, 0, input.amountPaise),
  ];
}

function refundDebitAccount(source: RefundSource): LedgerAccountCode {
  if (source.from === 'credit') return ACCOUNT.customerCredit;
  if (!source.milestoneDue) return ACCOUNT.advancesReceived;
  return source.payer === 'bank' ? ACCOUNT.bankLoanReceivables : ACCOUNT.customerReceivables;
}

/** Money paid back to the customer: out of the bank, cash or the gateway. */
export function refundPosting(input: {
  readonly method: RefundMethod;
  readonly amountPaise: number;
  readonly source: RefundSource;
}): JournalLine[] {
  return [
    line(refundDebitAccount(input.source), input.amountPaise, 0),
    line(cashAccountFor(input.method), 0, input.amountPaise),
  ];
}
