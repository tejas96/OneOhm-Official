import { describe, expect, it } from 'vitest';
import { ACCOUNT } from './ledger-accounts';
import {
  isBalanced,
  type JournalLine,
  payableApprovedPosting,
  payablePaidPosting,
  paymentPosting,
  reversalPosting,
} from './ledger-postings';
import {
  billTds,
  billToPay,
  customerTdsProblem,
  isValidPan,
  receivedMoney,
  TDS_MAX_BP,
  tdsRateForPayee,
} from './tds';

const net = (lines: readonly JournalLine[], account: string) =>
  lines
    .filter((line) => line.account === account)
    .reduce((sum, line) => sum + line.creditPaise - line.debitPaise, 0);

describe('TDS on a bill', () => {
  it('is a share of the value before GST, rounded to the rupee', () => {
    // ₹1,18,000 with ₹18,000 GST at 1%: ₹1,000 on the ₹1,00,000 before GST.
    expect(billTds({ amountPaise: 11_800_000, gstPaise: 1_800_000, tdsBp: 100 })).toBe(100_000);
    // 2% of ₹12,345.67 is ₹246.91, held as ₹247.
    expect(billTds({ amountPaise: 1_234_567, gstPaise: 0, tdsBp: 200 })).toBe(24_700);
    // 0.1% (194Q) of ₹5,00,000 before GST.
    expect(billTds({ amountPaise: 59_000_000, gstPaise: 9_000_000, tdsBp: 10 })).toBe(50_000);
  });

  it('is nothing without a rate and never above the cap or the bill', () => {
    expect(billTds({ amountPaise: 1_000_000, gstPaise: 0, tdsBp: 0 })).toBe(0);
    expect(billTds({ amountPaise: 1_000_000, gstPaise: 0, tdsBp: -50 })).toBe(0);
    expect(billTds({ amountPaise: 1_000_000, gstPaise: 0, tdsBp: 9_999 })).toBe(
      billTds({ amountPaise: 1_000_000, gstPaise: 0, tdsBp: TDS_MAX_BP }),
    );
    expect(billTds({ amountPaise: 1_000_000, gstPaise: 5_000_000, tdsBp: 100 })).toBe(0);
  });

  it('leaves the payee the bill less TDS and advances, never below zero', () => {
    expect(
      billToPay({ amountPaise: 11_800_000, tdsPaise: 100_000, advanceAdjustedPaise: 2_000_000 }),
    ).toBe(9_700_000);
    expect(billToPay({ amountPaise: 100, tdsPaise: 0, advanceAdjustedPaise: 500 })).toBe(0);
  });
});

describe('TDS postings', () => {
  const approved = payableApprovedPosting({
    party: 'contractor',
    amountPaise: 1_000_000,
    tdsPaise: 20_000,
  });

  it('books the full cost, owes the crew the rest and the government the TDS', () => {
    expect(isBalanced(approved)).toBe(true);
    expect(isBalanced(reversalPosting(approved))).toBe(true);
    expect(net(approved, ACCOUNT.installationCost)).toBe(-1_000_000);
    expect(net(approved, ACCOUNT.contractorPayables)).toBe(980_000);
    expect(net(approved, ACCOUNT.tdsPayable)).toBe(20_000);
  });

  it('pays the crew only what it is owed, clearing its payable', () => {
    const paid = payablePaidPosting({
      party: 'contractor',
      method: 'bank_transfer',
      amountPaise: billToPay({ amountPaise: 1_000_000, tdsPaise: 20_000, advanceAdjustedPaise: 0 }),
    });
    expect(net([...approved, ...paid], ACCOUNT.contractorPayables)).toBe(0);
    expect(net(paid, ACCOUNT.bank)).toBe(980_000);
  });

  it('keeps a bill without TDS exactly as before', () => {
    expect(payableApprovedPosting({ party: 'vendor', amountPaise: 500, tdsPaise: 0 })).toEqual(
      payableApprovedPosting({ party: 'vendor', amountPaise: 500 }),
    );
  });

  it('clears the whole receivable when a customer pays net of TDS', () => {
    const lines = paymentPosting({
      payer: 'customer',
      method: 'bank_transfer',
      amountPaise: 10_000_000,
      milestoneDue: true,
      tdsPaise: 200_000,
    });
    expect(isBalanced(lines)).toBe(true);
    expect(net(lines, ACCOUNT.customerReceivables)).toBe(10_000_000);
    expect(net(lines, ACCOUNT.bank)).toBe(-9_800_000);
    expect(net(lines, ACCOUNT.tdsReceivable)).toBe(-200_000);
  });

  it('holds an early receipt with TDS as an advance and a cheque in hand', () => {
    const lines = paymentPosting({
      payer: 'customer',
      method: 'cheque',
      amountPaise: 1_000_000,
      milestoneDue: false,
      tdsPaise: 10_000,
    });
    expect(isBalanced(lines)).toBe(true);
    expect(net(lines, ACCOUNT.advancesReceived)).toBe(1_000_000);
    expect(net(lines, ACCOUNT.chequesInHand)).toBe(-990_000);
  });
});

describe('TDS a customer deducted', () => {
  const base = { method: 'bank_transfer', payer: 'customer', fromCredit: false } as const;

  it('is fine on bank money within a fifth of the receipt', () => {
    expect(customerTdsProblem({ ...base, receivedPaise: 9_800_000, tdsPaise: 200_000 })).toBe(null);
    expect(customerTdsProblem({ ...base, method: 'cash', receivedPaise: 1, tdsPaise: 0 })).toBe(
      null,
    );
  });

  it('is refused on cash, online, credit or a bank disbursement', () => {
    const tds = { receivedPaise: 9_800_000, tdsPaise: 200_000 };
    expect(customerTdsProblem({ ...base, ...tds, method: 'cash' })).toBe('not_by_bank');
    expect(customerTdsProblem({ ...base, ...tds, method: 'razorpay' })).toBe('not_by_bank');
    expect(customerTdsProblem({ ...base, ...tds, fromCredit: true })).toBe('not_by_bank');
    expect(customerTdsProblem({ ...base, ...tds, payer: 'bank' })).toBe('not_by_bank');
  });

  it('flags a figure too large to be TDS', () => {
    expect(customerTdsProblem({ ...base, receivedPaise: 700_000, tdsPaise: 300_000 })).toBe(
      'too_high',
    );
  });

  it('separates the money from what the receipt settles', () => {
    expect(receivedMoney({ amountPaise: 10_000_000, tdsPaise: 200_000 })).toBe(9_800_000);
  });
});

describe('TDS for a payee without a PAN', () => {
  it('accepts only the PAN format', () => {
    expect(isValidPan('ABCDE1234F')).toBe(true);
    expect(isValidPan(' abcde1234f ')).toBe(true);
    expect(isValidPan('ABCDE12345')).toBe(false);
    expect(isValidPan('ABCD1234F')).toBe(false);
    expect(isValidPan('')).toBe(false);
    expect(isValidPan(null)).toBe(false);
  });

  it('keeps the rate with a valid PAN', () => {
    expect(tdsRateForPayee({ rateBp: 100, pan: 'ABCDE1234F' })).toBe(100);
  });

  it('lifts the rate to 20% with a missing or invalid PAN', () => {
    expect(tdsRateForPayee({ rateBp: 100, pan: null })).toBe(2000);
    expect(tdsRateForPayee({ rateBp: 200, pan: 'BAD' })).toBe(2000);
  });

  it('never lowers a higher rate and keeps 0 as 0', () => {
    expect(tdsRateForPayee({ rateBp: 2500, pan: null })).toBe(2500);
    expect(tdsRateForPayee({ rateBp: 0, pan: null })).toBe(0);
  });
});
