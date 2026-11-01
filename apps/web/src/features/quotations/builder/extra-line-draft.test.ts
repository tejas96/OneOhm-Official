import { describe, expect, it } from 'vitest';
import { EMPTY_EXTRA, extraFromDraft } from './extra-line-draft';

describe('extraFromDraft', () => {
  it('turns a lowered adjustment into a negative amount', () => {
    const result = extraFromDraft({
      ...EMPTY_EXTRA,
      kind: 'adjustment',
      description: 'Rounded off',
      price: '350',
      reason: 'Customer asked to round off',
    });
    expect(result).toEqual({
      line: {
        kind: 'adjustment',
        productId: null,
        description: 'Rounded off',
        quantity: 1,
        unit: 'job',
        unitPricePaise: -35_000,
        unitCostPaise: 0,
        reason: 'Customer asked to round off',
      },
    });
  });

  it('keeps a gift free but keeps its cost', () => {
    const result = extraFromDraft({
      ...EMPTY_EXTRA,
      kind: 'gift',
      description: 'Cleaning kit',
      price: '900',
      cost: '450',
      reason: 'Festive offer',
    });
    expect('line' in result && result.line).toMatchObject({
      unitPricePaise: 0,
      unitCostPaise: 45_000,
    });
  });

  it('asks for a reason on anything but an optional item', () => {
    expect(extraFromDraft({ ...EMPTY_EXTRA, kind: 'charge', description: 'Crane' })).toEqual({
      errors: ['reason'],
    });
    expect('line' in extraFromDraft({ ...EMPTY_EXTRA, description: 'Wi-Fi monitor' })).toBe(true);
  });
});
