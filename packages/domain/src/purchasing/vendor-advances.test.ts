import { describe, expect, it } from 'vitest';
import { ACCOUNT } from '../finance/ledger-accounts';
import {
  isBalanced,
  type JournalLine,
  payableApprovedPosting,
  payablePaidPosting,
} from '../finance/ledger-postings';
import {
  advanceRoom,
  canStepAdvance,
  planAdvanceAdjustments,
  vendorAdvanceAdjustedPosting,
  vendorAdvancePaidPosting,
} from './vendor-advances';

describe('planAdvanceAdjustments', () => {
  it('sets an advance against a bigger bill so only the balance stays payable', () => {
    const plan = planAdvanceAdjustments(
      [{ id: 'a1', openPaise: 30_000_00 }],
      [{ id: 'b1', balancePaise: 1_00_000_00 }],
    );
    expect(plan).toEqual([{ advanceId: 'a1', payableId: 'b1', amountPaise: 30_000_00 }]);
  });

  it('never adjusts more than the bill, and keeps the rest of the advance open', () => {
    const plan = planAdvanceAdjustments(
      [{ id: 'a1', openPaise: 50_000 }],
      [
        { id: 'b1', balancePaise: 20_000 },
        { id: 'b2', balancePaise: 10_000 },
      ],
    );
    expect(plan).toEqual([
      { advanceId: 'a1', payableId: 'b1', amountPaise: 20_000 },
      { advanceId: 'a1', payableId: 'b2', amountPaise: 10_000 },
    ]);
    const used = plan.reduce((sum, row) => sum + row.amountPaise, 0);
    expect(50_000 - used).toBe(20_000);
  });

  it('uses the oldest advance first and spills into the next one', () => {
    const plan = planAdvanceAdjustments(
      [
        { id: 'a1', openPaise: 5_000 },
        { id: 'a2', openPaise: 8_000 },
      ],
      [{ id: 'b1', balancePaise: 10_000 }],
    );
    expect(plan).toEqual([
      { advanceId: 'a1', payableId: 'b1', amountPaise: 5_000 },
      { advanceId: 'a2', payableId: 'b1', amountPaise: 5_000 },
    ]);
  });

  it('does nothing without an open advance or an unpaid bill', () => {
    expect(
      planAdvanceAdjustments([{ id: 'a1', openPaise: 0 }], [{ id: 'b', balancePaise: 9 }]),
    ).toEqual([]);
    expect(
      planAdvanceAdjustments([{ id: 'a1', openPaise: 9 }], [{ id: 'b', balancePaise: 0 }]),
    ).toEqual([]);
  });
});

describe('advance rules', () => {
  it('leaves room up to the order total', () => {
    expect(advanceRoom(1_00_000, 30_000)).toBe(70_000);
    expect(advanceRoom(1_00_000, 1_20_000)).toBe(0);
  });

  it('moves pending → approved → paid, and cancels only before payment', () => {
    expect(canStepAdvance('pending', 'approve')).toBe(true);
    expect(canStepAdvance('pending', 'pay')).toBe(false);
    expect(canStepAdvance('approved', 'pay')).toBe(true);
    expect(canStepAdvance('approved', 'cancel')).toBe(true);
    expect(canStepAdvance('paid', 'cancel')).toBe(false);
  });
});

describe('advance postings', () => {
  const balanceOf = (lines: readonly JournalLine[], account: string) =>
    lines
      .filter((row) => row.account === account)
      .reduce((sum, row) => sum + row.debitPaise - row.creditPaise, 0);

  it('pays an advance out of the bank into vendor advances', () => {
    const lines = vendorAdvancePaidPosting({ method: 'bank_transfer', amountPaise: 30_000 });
    expect(isBalanced(lines)).toBe(true);
    expect(balanceOf(lines, ACCOUNT.vendorAdvances)).toBe(30_000);
    expect(balanceOf(lines, ACCOUNT.bank)).toBe(-30_000);
    expect(
      balanceOf(vendorAdvancePaidPosting({ method: 'cash', amountPaise: 1 }), ACCOUNT.cash),
    ).toBe(-1);
  });

  it('nets out: advance, bill, adjustment and balance paid leave nothing owed', () => {
    const bill = 1_00_000;
    const advance = 30_000;
    const journey = [
      ...vendorAdvancePaidPosting({ method: 'bank_transfer', amountPaise: advance }),
      ...payableApprovedPosting({ party: 'vendor', amountPaise: bill }),
      ...vendorAdvanceAdjustedPosting({ amountPaise: advance }),
      ...payablePaidPosting({
        party: 'vendor',
        method: 'bank_transfer',
        amountPaise: bill - advance,
      }),
    ];
    expect(isBalanced(vendorAdvanceAdjustedPosting({ amountPaise: advance }))).toBe(true);
    expect(balanceOf(journey, ACCOUNT.vendorAdvances)).toBe(0);
    expect(balanceOf(journey, ACCOUNT.vendorPayables)).toBe(0);
    expect(balanceOf(journey, ACCOUNT.bank)).toBe(-bill);
    expect(balanceOf(journey, ACCOUNT.materialCost)).toBe(bill);
  });
});
