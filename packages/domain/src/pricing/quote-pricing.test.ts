import { describe, expect, it } from 'vitest';
import { compareWithSurvey, priceQuote, type QuoteLineInput } from './quote-pricing';

const line = (overrides: Partial<QuoteLineInput>): QuoteLineInput => ({
  key: 'x',
  description: 'x',
  category: 'other',
  quantity: 1,
  unit: 'nos',
  unitPricePaise: 10_000_00,
  unitCostPaise: 8_000_00,
  taxRateBp: 500,
  basis: 'catalog',
  ...overrides,
});

describe('priceQuote', () => {
  it('adds tax per line and keeps cost and margin', () => {
    const result = priceQuote([line({ key: 'a' }), line({ key: 'b', taxRateBp: 1800 })], {
      contingencyBp: 0,
      discountPaise: 0,
    });
    expect(result.subtotalPaise).toBe(20_000_00);
    expect(result.taxPaise).toBe(500_00 + 1_800_00);
    expect(result.totalPaise).toBe(22_300_00);
    expect(result.marginPaise).toBe(4_000_00);
  });

  it('adds contingency only to default-based quantities', () => {
    const result = priceQuote([line({ key: 'a', basis: 'default' }), line({ key: 'b' })], {
      contingencyBp: 1000,
      discountPaise: 0,
    });
    expect(result.contingencyPaise).toBe(1_000_00);
  });

  it('keeps every amount in whole rupees', () => {
    const result = priceQuote([line({ key: 'a', quantity: 3.33, unitPricePaise: 1_234_56 })], {
      contingencyBp: 0,
      discountPaise: 0,
    });
    expect(result.totalPaise % 100).toBe(0);
    expect(result.taxPaise % 100).toBe(0);
  });

  it('spreads a discount before tax and never below zero', () => {
    const result = priceQuote([line({ key: 'a' }), line({ key: 'b' })], {
      contingencyBp: 0,
      discountPaise: 2_000_00,
    });
    expect(result.discountPaise).toBe(2_000_00);
    expect(result.totalPaise).toBe(18_900_00);
    expect(priceQuote([line({})], { contingencyBp: 0, discountPaise: 99_999_99 }).totalPaise).toBe(
      0,
    );
  });
});

describe('compareWithSurvey', () => {
  it('absorbs variance within tolerance and flags it beyond', () => {
    expect(compareWithSurvey(100_000_00, 102_000_00, 300).withinTolerance).toBe(true);
    expect(compareWithSurvey(100_000_00, 104_000_00, 300)).toEqual({
      variancePaise: 4_000_00,
      varianceBp: 400,
      withinTolerance: false,
    });
  });
});
