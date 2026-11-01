import { describe, expect, it } from 'vitest';
import { EMPTY_EXTRA_FORM, extraFromForm } from './quote-extras';

describe('extraFromForm', () => {
  it('makes a gift free to the customer and keeps its cost', () => {
    const result = extraFromForm({
      ...EMPTY_EXTRA_FORM,
      description: 'Panel cleaning kit',
      amount: '900',
      cost: '450',
      reason: 'Festive offer',
    });
    expect('line' in result && result.line).toMatchObject({
      unitPricePaise: 0,
      unitCostPaise: 45_000,
    });
  });

  it('lowers the price with a negative adjustment', () => {
    const result = extraFromForm({
      ...EMPTY_EXTRA_FORM,
      kind: 'adjustment',
      description: 'Round off',
      amount: '350',
      reason: 'Customer asked',
    });
    expect('line' in result && result.line.unitPricePaise).toBe(-35_000);
  });

  it('asks for a reason except on optional items', () => {
    expect(extraFromForm({ ...EMPTY_EXTRA_FORM, kind: 'charge', description: 'Crane' })).toEqual({
      problems: ['reason'],
    });
    const optional = extraFromForm({
      ...EMPTY_EXTRA_FORM,
      kind: 'optional',
      description: 'Wi-Fi stick',
    });
    expect('line' in optional).toBe(true);
  });
});
