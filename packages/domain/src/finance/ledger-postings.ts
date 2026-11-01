import { ACCOUNT, type LedgerAccountCode } from './ledger-accounts';
import type { Payer } from './payment-milestones';

/** One side of a journal entry. Exactly one of debit or credit is above zero. */
export interface JournalLine {
  readonly account: LedgerAccountCode;
  readonly debitPaise: number;
  readonly creditPaise: number;
}

export type MoneyInMethod =
  | 'cash'
  | 'cheque'
  | 'bank_transfer'
  | 'upi'
  | 'razorpay'
  | 'bank_disbursement';
export type MoneyOutMethod = 'cash' | 'cheque' | 'bank_transfer' | 'upi';
export type PayableParty = 'vendor' | 'contractor';

const debit = (account: LedgerAccountCode, paise: number): JournalLine => ({
  account,
  debitPaise: paise,
  creditPaise: 0,
});
const credit = (account: LedgerAccountCode, paise: number): JournalLine => ({
  account,
  debitPaise: 0,
  creditPaise: paise,
});

/** Where money sits: cash in hand, the payment gateway, or the bank. */
export function cashAccountFor(method: MoneyInMethod | MoneyOutMethod): LedgerAccountCode {
  if (method === 'cash') return ACCOUNT.cash;
  if (method === 'razorpay') return ACCOUNT.gateway;
  return ACCOUNT.bank;
}

const receivableFor = (payer: Payer) =>
  payer === 'bank' ? ACCOUNT.bankLoanReceivables : ACCOUNT.customerReceivables;

/**
 * A milestone falls due: the customer (or bank) owes it. The full price is invoiced;
 * the GST share is a liability, the rest is revenue. The subsidy never appears.
 */
export function milestoneDuePosting(input: {
  readonly payer: Payer;
  readonly amountPaise: number;
  readonly gstPaise: number;
}): JournalLine[] {
  const gst = Math.min(Math.max(0, input.gstPaise), input.amountPaise);
  const revenue = input.amountPaise - gst;
  return [
    debit(receivableFor(input.payer), input.amountPaise),
    ...(revenue > 0 ? [credit(ACCOUNT.revenue, revenue)] : []),
    ...(gst > 0 ? [credit(ACCOUNT.gstOutput, gst)] : []),
  ];
}

/** Money received. Before its milestone is due it is an advance, not a settlement. */
export function paymentPosting(input: {
  readonly payer: Payer;
  readonly method: MoneyInMethod;
  readonly amountPaise: number;
  readonly milestoneDue: boolean;
}): JournalLine[] {
  return [
    debit(cashAccountFor(input.method), input.amountPaise),
    credit(
      input.milestoneDue ? receivableFor(input.payer) : ACCOUNT.advancesReceived,
      input.amountPaise,
    ),
  ];
}

/**
 * The gateway kept its fee (and the GST on it) from an online payment: an expense, and
 * less money waiting in gateway clearing. GST input credit is for the accountant to claim.
 */
export function gatewayFeePosting(input: { readonly feePaise: number }): JournalLine[] {
  return [debit(ACCOUNT.gatewayFees, input.feePaise), credit(ACCOUNT.gateway, input.feePaise)];
}

/** The gateway paid its collected money (after fees) into the bank. */
export function settlementPosting(input: { readonly amountPaise: number }): JournalLine[] {
  return [debit(ACCOUNT.bank, input.amountPaise), credit(ACCOUNT.gateway, input.amountPaise)];
}

/** An advance is set against its milestone once that milestone falls due. */
export function advanceAppliedPosting(input: {
  readonly payer: Payer;
  readonly amountPaise: number;
}): JournalLine[] {
  return [
    debit(ACCOUNT.advancesReceived, input.amountPaise),
    credit(receivableFor(input.payer), input.amountPaise),
  ];
}

const payableAccount = (party: PayableParty) =>
  party === 'vendor' ? ACCOUNT.vendorPayables : ACCOUNT.contractorPayables;

/** An approved bill: the cost is booked and OneOhm owes the vendor or crew. */
export function payableApprovedPosting(input: {
  readonly party: PayableParty;
  readonly amountPaise: number;
}): JournalLine[] {
  const cost = input.party === 'vendor' ? ACCOUNT.materialCost : ACCOUNT.installationCost;
  return [debit(cost, input.amountPaise), credit(payableAccount(input.party), input.amountPaise)];
}

export function payablePaidPosting(input: {
  readonly party: PayableParty;
  readonly method: MoneyOutMethod;
  readonly amountPaise: number;
}): JournalLine[] {
  return [
    debit(payableAccount(input.party), input.amountPaise),
    credit(cashAccountFor(input.method), input.amountPaise),
  ];
}

/**
 * TDS held back from a contractor's work order: it is part of the work's cost, and
 * OneOhm owes it to the government, not to the contractor.
 */
export function contractorTdsPosting(input: { readonly amountPaise: number }): JournalLine[] {
  return [
    debit(ACCOUNT.installationCost, input.amountPaise),
    credit(ACCOUNT.tdsPayable, input.amountPaise),
  ];
}

/** Mistakes are never edited: a reversing entry swaps every debit and credit. */
export function reversalPosting(lines: readonly JournalLine[]): JournalLine[] {
  return lines.map((line) => ({
    account: line.account,
    debitPaise: line.creditPaise,
    creditPaise: line.debitPaise,
  }));
}

/** A valid entry has positive one-sided lines whose debits equal its credits. */
export function isBalanced(lines: readonly JournalLine[]): boolean {
  if (lines.length < 2) return false;
  let debits = 0;
  let credits = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.debitPaise) || !Number.isInteger(line.creditPaise)) return false;
    if (line.debitPaise < 0 || line.creditPaise < 0) return false;
    if (line.debitPaise > 0 === line.creditPaise > 0) return false;
    debits += line.debitPaise;
    credits += line.creditPaise;
  }
  return debits === credits;
}

/**
 * Splits the quotation's GST across milestones in proportion to their amounts, using
 * the largest remainder so the parts always add up to the whole tax exactly.
 */
export function allocateTax(amounts: readonly number[], taxPaise: number): number[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (total <= 0 || taxPaise <= 0) return amounts.map(() => 0);
  const exact = amounts.map((amount) => (taxPaise * amount) / total);
  const parts = exact.map((value) => Math.floor(value));
  let left = taxPaise - parts.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    left -= 1;
  }
  return parts;
}
