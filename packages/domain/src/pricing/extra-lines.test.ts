import { describe, expect, it } from 'vitest';
import { type ExtraLine, extraLineProblem, extraQuoteLines } from './extra-lines';
import { priceQuote, type QuoteLineInput } from './quote-pricing';

const engine = (overrides: Partial<QuoteLineInput> = {}): QuoteLineInput => ({
  key: 'panel',
  description: 'Panels',
  category: 'panel',
  quantity: 1,
  unit: 'nos',
  unitPricePaise: 100_000_00,
  unitCostPaise: 80_000_00,
  taxRateBp: 500,
  basis: 'catalog',
  ...overrides,
});

const extra = (overrides: Partial<ExtraLine>): ExtraLine => ({
  kind: 'charge',
  description: 'Crane hire',
  category: 'other',
  quantity: 1,
  unit: 'job',
  unitPricePaise: 5_000_00,
  unitCostPaise: 4_000_00,
  taxRateBp: 1800,
  reason: 'Fourth-floor roof without stairs',
  ...overrides,
});

const price = (extras: readonly ExtraLine[], discountPaise = 0) =>
  priceQuote([engine(), ...extraQuoteLines(extras)], { contingencyBp: 0, discountPaise });

describe('extra quotation lines', () => {
  it('adds a site charge to the total with its own GST', () => {
    const result = price([extra({})]);
    expect(result.totalPaise).toBe(105_000_00 + 5_900_00);
    expect(result.marginPaise).toBe(20_000_00 + 1_000_00);
  });

  it('gives a gift free but keeps its cost', () => {
    const result = price([
      extra({ kind: 'gift', unitPricePaise: 2_500_00, unitCostPaise: 1_200_00 }),
    ]);
    expect(result.totalPaise).toBe(105_000_00);
    expect(result.costPaise).toBe(81_200_00);
    expect(result.lines[1]?.amountPaise).toBe(0);
  });

  it('shows an optional item without counting it anywhere', () => {
    const result = price([extra({ kind: 'optional', unitPricePaise: 10_000_00, taxRateBp: 1200 })]);
    expect(result.totalPaise).toBe(105_000_00);
    expect(result.costPaise).toBe(80_000_00);
    expect(result.optionalPaise).toBe(11_200_00);
    expect(result.lines[1]?.totalPaise).toBe(11_200_00);
  });

  it('counts a downward adjustment as a reduction, beside the discount', () => {
    const result = price(
      [extra({ kind: 'adjustment', unitPricePaise: -3_000_00, taxRateBp: 500 })],
      1_000_00,
    );
    expect(result.totalPaise).toBe(105_000_00 - 1_050_00 - 3_150_00);
    expect(result.reductionPaise).toBe(4_000_00);
    expect(result.lines[1]?.discountPaise).toBe(0);
  });

  it('spreads the discount over engine lines and charges only', () => {
    const result = price([extra({}), extra({ kind: 'gift' })], 2_000_00);
    const shares = result.lines.map((line) => line.discountPaise);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(2_000_00);
    expect(shares[2]).toBe(0);
  });

  it('needs a reason for anything that changes price or cost', () => {
    expect(extraLineProblem(extra({ reason: '' }))).toBe('reason_needed');
    expect(extraLineProblem(extra({ kind: 'optional', reason: '' }))).toBeNull();
    expect(extraLineProblem(extra({ unitPricePaise: -1 }))).toBe('negative_price');
    expect(extraLineProblem(extra({ kind: 'adjustment', unitPricePaise: 0 }))).toBe(
      'zero_adjustment',
    );
  });
});
