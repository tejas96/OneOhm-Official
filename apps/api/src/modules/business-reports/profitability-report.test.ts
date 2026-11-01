import { describe, expect, it } from 'vitest';
import {
  acceptedQuotationId,
  actualCost,
  byMarginAscending,
  profit,
  splitEstimate,
  totalOf,
} from './profitability-report.math';

describe('splitEstimate', () => {
  it('groups quoted cost into material, installation and the rest', () => {
    expect(
      splitEstimate([
        { category: 'panel', costPaise: 9_000_000 },
        { category: 'inverter', costPaise: 2_800_000 },
        { category: 'cable', costPaise: 150_000 },
        { category: 'installation', costPaise: 900_000 },
        { category: 'transport', costPaise: 200_000 },
        { category: 'liaisoning', costPaise: 100_000 },
      ]),
    ).toEqual({ materialPaise: 11_950_000, installationPaise: 900_000, otherPaise: 300_000 });
  });
});

describe('actualCost', () => {
  it('values dispatched stock at cost and counts every bill whatever its status', () => {
    const actual = actualCost(
      [
        { party: 'vendor', status: 'paid', amountPaise: 240_050, fromReceipt: false },
        { party: 'contractor', status: 'pending', amountPaise: 922_100, fromReceipt: false },
        { party: 'contractor', status: 'approved', amountPaise: 49_100, fromReceipt: false },
      ],
      [
        { onHandDelta: -1, unitCostPaise: 1_950_000 },
        { onHandDelta: -12.5, unitCostPaise: 7_000 },
      ],
    );
    expect(actual).toEqual({
      stockPaise: 2_037_500,
      vendorPaise: 240_050,
      contractorPaise: 971_200,
    });
    expect(totalOf(actual)).toBe(3_248_750);
  });

  it('does not count a goods-receipt bill, whose stock is counted when dispatched', () => {
    const actual = actualCost(
      [{ party: 'vendor', status: 'paid', amountPaise: 10_563_000, fromReceipt: true }],
      [{ onHandDelta: -8, unitCostPaise: 1_210_000 }],
    );
    expect(actual).toEqual({ stockPaise: 9_680_000, vendorPaise: 0, contractorPaise: 0 });
  });
});

describe('profit', () => {
  it('gives variance as actual − estimated, and both margins on the contract', () => {
    expect(profit(17_000_000, 13_600_000, 14_450_000)).toEqual({
      variancePaise: 850_000,
      overBudget: true,
      estimatedMarginRate: 0.2,
      marginSoFarRate: 0.15,
    });
  });

  it('is under budget below the estimate, and has no margin without a price', () => {
    expect(profit(10_000_000, 8_000_000, 2_000_000)).toMatchObject({
      variancePaise: -6_000_000,
      overBudget: false,
      marginSoFarRate: 0.8,
    });
    expect(profit(0, 0, 0)).toMatchObject({ estimatedMarginRate: null, marginSoFarRate: null });
  });
});

describe('acceptedQuotationId', () => {
  it('uses the survey revision only once the customer accepted it', () => {
    const project = { quotationId: 'q1', revisionQuotationId: 'q2' };
    expect(acceptedQuotationId(project, new Map([['q2', 'draft']]))).toBe('q1');
    expect(acceptedQuotationId(project, new Map([['q2', 'accepted']]))).toBe('q2');
    expect(acceptedQuotationId({ quotationId: 'q1', revisionQuotationId: null }, new Map())).toBe(
      'q1',
    );
  });
});

describe('byMarginAscending', () => {
  it('puts the lowest margin first and projects without a price last', () => {
    const rows = [
      { code: 'OH-3', marginSoFarRate: null },
      { code: 'OH-2', marginSoFarRate: 0.9 },
      { code: 'OH-1', marginSoFarRate: -0.05 },
    ];
    expect([...rows].sort(byMarginAscending).map((row) => row.code)).toEqual([
      'OH-1',
      'OH-2',
      'OH-3',
    ]);
  });
});
