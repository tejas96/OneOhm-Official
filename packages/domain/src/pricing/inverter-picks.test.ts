import { describe, expect, it } from 'vitest';
import { atAcceptedPrice } from './accepted-prices';
import {
  inverterFit,
  inverterLineKey,
  inverterPicks,
  inverterSummary,
  inverterTotalW,
  isInverterLineKey,
  mainInverterId,
  suggestInverterMix,
} from './inverter-picks';

describe('inverter picks', () => {
  it('reads an older single-inverter input as one inverter', () => {
    expect(inverterPicks({ inverterProductId: 'a' })).toEqual([{ productId: 'a', quantity: 1 }]);
    expect(inverterPicks({})).toEqual([]);
  });

  it('prefers the list and counts the same model once, in its first place', () => {
    const picks = inverterPicks({
      inverterProductId: 'ignored',
      inverters: [
        { productId: 'a', quantity: 1 },
        { productId: 'b', quantity: 2 },
        { productId: 'a', quantity: 2 },
      ],
    });
    expect(picks).toEqual([
      { productId: 'a', quantity: 3 },
      { productId: 'b', quantity: 2 },
    ]);
    expect(mainInverterId(picks)).toBe('a');
  });

  it('keys lines inverter, inverter_2, inverter_3', () => {
    expect([0, 1, 2].map(inverterLineKey)).toEqual(['inverter', 'inverter_2', 'inverter_3']);
    expect(isInverterLineKey('inverter_2')).toBe(true);
    expect(isInverterLineKey('inverter_location')).toBe(false);
  });

  it('adds up ratings and names the mix', () => {
    const picks = [
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 1 },
    ];
    const rated: Record<string, number> = { a: 5000, b: 3000 };
    expect(inverterTotalW(picks, (id) => rated[id])).toBe(13_000);
    expect(inverterSummary(picks, (id) => id.toUpperCase())).toBe('A × 2, B');
  });

  it('warns when the inverters are too small or too large for the panels', () => {
    expect(inverterFit(10_000, 10_000)).toBe('ok');
    expect(inverterFit(12_500, 10_000)).toBe('ok');
    expect(inverterFit(14_000, 10_000)).toBe('small');
    expect(inverterFit(5_000, 10_000)).toBe('large');
    expect(inverterFit(5_000, 0)).toBe('unknown');
  });
});

describe('accepted inverter prices', () => {
  const product = (id: string) => ({
    id,
    name: id,
    unit: 'nos',
    pricePaise: 100,
    costPaise: 80,
    taxRateBp: 500,
  });
  const saved = [
    { key: 'inverter', productId: 'a', unitPricePaise: 90, unitCostPaise: 70, taxRateBp: 500 },
    { key: 'inverter_2', productId: 'b', unitPricePaise: 50, unitCostPaise: 40, taxRateBp: 500 },
  ];

  it('finds each inverter by its product, whatever line it sat on', () => {
    expect(atAcceptedPrice(product('b'), saved, 'inverter').pricePaise).toBe(50);
    expect(atAcceptedPrice(product('a'), saved, 'inverter').pricePaise).toBe(90);
    expect(atAcceptedPrice(product('c'), saved, 'inverter').pricePaise).toBe(100);
  });
});

describe('suggested inverter mix', () => {
  const models = [
    { id: 'i3', ratedW: 3000 },
    { id: 'i5', ratedW: 5000 },
    { id: 'i25', ratedW: 25_000 },
    { id: 'i50', ratedW: 50_000 },
  ];

  it('takes one model when one carries the array', () => {
    expect(suggestInverterMix(models, 4800)).toEqual([{ productId: 'i5', quantity: 1 }]);
    expect(suggestInverterMix(models, 52_000)).toEqual([{ productId: 'i50', quantity: 1 }]);
  });

  it('fills a large array with the largest model and smaller ones for the rest', () => {
    expect(suggestInverterMix(models, 120_000)).toEqual([
      { productId: 'i50', quantity: 2 },
      { productId: 'i25', quantity: 1 },
    ]);
    expect(suggestInverterMix(models, 100_000)).toEqual([{ productId: 'i50', quantity: 2 }]);
    const noMid = models.filter((model) => model.id !== 'i25');
    expect(suggestInverterMix(noMid, 115_000)).toEqual([
      { productId: 'i50', quantity: 2 },
      { productId: 'i5', quantity: 3 },
    ]);
  });

  it('suggests nothing without rated models', () => {
    expect(suggestInverterMix([], 5000)).toEqual([]);
  });
});
