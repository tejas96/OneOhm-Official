import { describe, expect, it } from 'vitest';
import { ACCOUNT, LEDGER_ACCOUNTS } from './ledger-accounts';
import {
  advanceAppliedPosting,
  allocateTax,
  cashAccountFor,
  isBalanced,
  type JournalLine,
  milestoneDuePosting,
  payableApprovedPosting,
  payablePaidPosting,
  paymentPosting,
  reversalPosting,
} from './ledger-postings';
import { ageingBucket, financialYear } from './receivable-ageing';

const total = (lines: readonly JournalLine[], side: 'debitPaise' | 'creditPaise') =>
  lines.reduce((sum, line) => sum + line[side], 0);

describe('posting rules', () => {
  const every: JournalLine[][] = [
    milestoneDuePosting({ payer: 'customer', amountPaise: 6_980_775, gstPaise: 365_000 }),
    milestoneDuePosting({ payer: 'bank', amountPaise: 15_000_000, gstPaise: 0 }),
    paymentPosting({
      payer: 'customer',
      method: 'upi',
      amountPaise: 5_000_000,
      milestoneDue: true,
    }),
    paymentPosting({ payer: 'customer', method: 'cash', amountPaise: 100, milestoneDue: false }),
    paymentPosting({
      payer: 'bank',
      method: 'bank_disbursement',
      amountPaise: 1,
      milestoneDue: true,
    }),
    advanceAppliedPosting({ payer: 'customer', amountPaise: 250_000 }),
    payableApprovedPosting({ party: 'vendor', amountPaise: 1_200_000 }),
    payableApprovedPosting({ party: 'contractor', amountPaise: 900_000 }),
    payablePaidPosting({ party: 'vendor', method: 'bank_transfer', amountPaise: 1_200_000 }),
  ];

  it('always balances, with one-sided positive lines', () => {
    for (const lines of every) {
      expect(isBalanced(lines)).toBe(true);
      expect(isBalanced(reversalPosting(lines))).toBe(true);
    }
  });

  it('only uses accounts in the chart', () => {
    const codes = new Set<string>(LEDGER_ACCOUNTS.map((account) => account.code));
    for (const line of every.flat()) expect(codes.has(line.account)).toBe(true);
  });

  it('splits a due milestone into revenue and GST, never touching the subsidy', () => {
    const lines = milestoneDuePosting({
      payer: 'customer',
      amountPaise: 1_120_000,
      gstPaise: 120_000,
    });
    expect(lines).toEqual([
      { account: ACCOUNT.customerReceivables, debitPaise: 1_120_000, creditPaise: 0 },
      { account: ACCOUNT.revenue, debitPaise: 0, creditPaise: 1_000_000 },
      { account: ACCOUNT.gstOutput, debitPaise: 0, creditPaise: 120_000 },
    ]);
  });

  it('books money before the milestone is due as an advance', () => {
    const lines = paymentPosting({
      payer: 'customer',
      method: 'cheque',
      amountPaise: 500,
      milestoneDue: false,
    });
    expect(lines[1]?.account).toBe(ACCOUNT.advancesReceived);
    expect(lines[0]?.account).toBe(ACCOUNT.bank);
  });

  it('reversal swaps every side', () => {
    const lines = payableApprovedPosting({ party: 'contractor', amountPaise: 700 });
    const reversed = reversalPosting(lines);
    expect(total(reversed, 'debitPaise')).toBe(total(lines, 'creditPaise'));
    expect(reversed[0]).toEqual({
      account: ACCOUNT.installationCost,
      debitPaise: 0,
      creditPaise: 700,
    });
  });

  it('rejects unbalanced or two-sided lines', () => {
    expect(isBalanced([{ account: ACCOUNT.bank, debitPaise: 10, creditPaise: 0 }])).toBe(false);
    expect(
      isBalanced([
        { account: ACCOUNT.bank, debitPaise: 10, creditPaise: 0 },
        { account: ACCOUNT.revenue, debitPaise: 0, creditPaise: 9 },
      ]),
    ).toBe(false);
    expect(
      isBalanced([
        { account: ACCOUNT.bank, debitPaise: 10, creditPaise: 10 },
        { account: ACCOUNT.revenue, debitPaise: 0, creditPaise: 0 },
      ]),
    ).toBe(false);
  });

  it('routes money by method', () => {
    expect(cashAccountFor('cash')).toBe(ACCOUNT.cash);
    expect(cashAccountFor('razorpay')).toBe(ACCOUNT.gateway);
    expect(cashAccountFor('bank_disbursement')).toBe(ACCOUNT.bank);
  });
});

describe('allocateTax', () => {
  it('adds up to the whole tax exactly', () => {
    const parts = allocateTax([6_980_775, 18_150_015, 2_792_310], 1_330_000);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(1_330_000);
  });

  it('gives nothing when there is no tax', () => {
    expect(allocateTax([100, 200], 0)).toEqual([0, 0]);
  });
});

describe('ageing and financial year', () => {
  it('buckets by days since due', () => {
    expect(ageingBucket(0)).toBe('current');
    expect(ageingBucket(45)).toBe('days_31_60');
    expect(ageingBucket(75)).toBe('days_61_90');
    expect(ageingBucket(120)).toBe('days_over_90');
  });

  it('runs April to March', () => {
    expect(financialYear('2026-11-02')).toBe('2026-27');
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2027-04-01')).toBe('2027-28');
  });
});
