import { describe, expect, it } from 'vitest';
import {
  purchaseLineAmount,
  purchaseLineTax,
  purchaseLineTotal,
  purchaseOrderTotals,
} from './order-line-totals';

describe('purchaseLineTotal', () => {
  it('adds GST to the amount', () => {
    // 10 panels at ₹12,500 with 12% GST.
    const line = { quantity: 10, ratePaise: 12_500_00, taxRateBp: 1200 };
    expect(purchaseLineAmount(line)).toBe(1_25_000_00);
    expect(purchaseLineTax(line)).toBe(15_000_00);
    expect(purchaseLineTotal(line)).toBe(1_40_000_00);
  });

  it('rounds the amount to the paisa before working out GST', () => {
    // 2.5 m at 333 paise = 832.5 → 833; 18% of 833 = 149.94 → 150.
    const line = { quantity: 2.5, ratePaise: 333, taxRateBp: 1800 };
    expect(purchaseLineAmount(line)).toBe(833);
    expect(purchaseLineTax(line)).toBe(150);
    expect(purchaseLineTotal(line)).toBe(983);
  });

  it('charges no GST on a zero-rated line', () => {
    expect(purchaseLineTotal({ quantity: 3, ratePaise: 1_000, taxRateBp: 0 })).toBe(3_000);
  });

  it('is zero for an empty line', () => {
    expect(purchaseLineTotal({ quantity: 0, ratePaise: 0, taxRateBp: 1800 })).toBe(0);
  });
});

describe('purchaseOrderTotals', () => {
  it('sums lines so GST is the gap between total and subtotal', () => {
    const totals = purchaseOrderTotals([
      { quantity: 2.5, ratePaise: 333, taxRateBp: 1800 },
      { quantity: 10, ratePaise: 12_500_00, taxRateBp: 1200 },
    ]);
    expect(totals).toEqual({
      subtotalPaise: 1_25_000_00 + 833,
      taxPaise: 15_000_00 + 150,
      totalPaise: 1_40_000_00 + 983,
    });
  });

  it('is all zero with no lines', () => {
    expect(purchaseOrderTotals([])).toEqual({ subtotalPaise: 0, taxPaise: 0, totalPaise: 0 });
  });
});
