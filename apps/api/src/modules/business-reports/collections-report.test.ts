import { describe, expect, it } from 'vitest';
import {
  ageingRows,
  collectionRate,
  type MilestoneFact,
  methodRows,
  netByPayer,
  standing,
} from './collections-report.math';

const TODAY = '2026-11-01';
const milestone = (fact: Partial<MilestoneFact>): MilestoneFact => ({
  projectId: 'p1',
  payer: 'customer',
  amountPaise: 100_000,
  paidPaise: 0,
  paid: false,
  dueOn: null,
  ...fact,
});

describe('standing', () => {
  it('is not due until its event happens, or while its due date is ahead', () => {
    expect(standing(milestone({}), TODAY)).toEqual({
      outstandingPaise: 100_000,
      due: false,
      daysPastDue: null,
      overdue: false,
    });
    expect(standing(milestone({ dueOn: '2026-11-05' }), TODAY).due).toBe(false);
  });

  it('is due but not overdue on its due day, overdue from the next', () => {
    expect(standing(milestone({ dueOn: TODAY }), TODAY)).toMatchObject({
      due: true,
      daysPastDue: 0,
      overdue: false,
    });
    expect(standing(milestone({ dueOn: '2026-10-02' }), TODAY)).toMatchObject({
      daysPastDue: 30,
      overdue: true,
    });
  });

  it('owes only what is left, and nothing once paid or overpaid', () => {
    expect(standing(milestone({ paidPaise: 40_000 }), TODAY).outstandingPaise).toBe(60_000);
    expect(standing(milestone({ paidPaise: 120_000 }), TODAY).outstandingPaise).toBe(0);
    expect(standing(milestone({ paid: true }), TODAY).outstandingPaise).toBe(0);
  });
});

describe('ageingRows', () => {
  it('puts unpaid due money in 0–30, 31–60, 61–90 and over 90 days, by payer', () => {
    const rows = ageingRows(
      [
        milestone({ dueOn: TODAY, paidPaise: 25_000 }),
        milestone({ dueOn: '2026-10-02' }),
        milestone({ dueOn: '2026-10-01', payer: 'bank' }),
        milestone({ dueOn: '2026-08-03' }),
        milestone({ dueOn: '2026-08-02', payer: 'bank', amountPaise: 500_000 }),
        milestone({ dueOn: '2026-01-01', paid: true }),
        milestone({}),
      ],
      TODAY,
    );
    expect(rows).toEqual([
      { bucket: 'current', customerPaise: 175_000, bankPaise: 0, milestones: 2 },
      { bucket: 'days_31_60', customerPaise: 0, bankPaise: 100_000, milestones: 1 },
      { bucket: 'days_61_90', customerPaise: 100_000, bankPaise: 0, milestones: 1 },
      { bucket: 'days_over_90', customerPaise: 0, bankPaise: 500_000, milestones: 1 },
    ]);
  });
});

describe('collectionRate', () => {
  const range = { start: '2026-10-01', end: '2026-10-31' };

  it('is the share of what fell due in the range that is paid by now', () => {
    const result = collectionRate(
      [
        milestone({ dueOn: '2026-10-05', paidPaise: 100_000 }),
        milestone({ dueOn: '2026-10-20', paidPaise: 50_000 }),
        milestone({ dueOn: '2026-09-30', paidPaise: 0 }),
        milestone({ dueOn: null, paidPaise: 100_000 }),
      ],
      range,
    );
    expect(result).toEqual({
      fellDuePaise: 200_000,
      fellDuePaidPaise: 150_000,
      collectionRate: 0.75,
    });
  });

  it('never counts more than a milestone is worth, and is null when nothing fell due', () => {
    const over = collectionRate([milestone({ dueOn: '2026-10-05', paidPaise: 150_000 })], range);
    expect(over.collectionRate).toBe(1);
    expect(collectionRate([milestone({})], range).collectionRate).toBeNull();
  });
});

describe('methodRows and netByPayer', () => {
  const moves = [
    { payer: 'customer' as const, method: 'cheque' as const, amountPaise: 300_000, on: TODAY },
    { payer: 'customer' as const, method: 'cheque' as const, amountPaise: -300_000, on: TODAY },
    { payer: 'customer' as const, method: 'upi' as const, amountPaise: 200_000, on: TODAY },
    {
      payer: 'bank' as const,
      method: 'bank_disbursement' as const,
      amountPaise: 1_000_000,
      on: TODAY,
    },
  ];

  it('shows money in and back out per method, leaving out methods not used', () => {
    expect(methodRows(moves)).toEqual([
      { method: 'cheque', receivedPaise: 300_000, returnedPaise: 300_000, netPaise: 0 },
      { method: 'upi', receivedPaise: 200_000, returnedPaise: 0, netPaise: 200_000 },
      {
        method: 'bank_disbursement',
        receivedPaise: 1_000_000,
        returnedPaise: 0,
        netPaise: 1_000_000,
      },
    ]);
  });

  it('nets reversals against money in, by payer', () => {
    expect(netByPayer(moves)).toEqual({ customerPaise: 200_000, bankPaise: 1_000_000 });
  });
});
