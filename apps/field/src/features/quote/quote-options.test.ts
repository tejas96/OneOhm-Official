import type { Product } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import {
  inverterPicksOf,
  parseKw,
  rupeesToPaise,
  suggestInverter,
  suggestInverterRows,
} from './quote-options';

function inverter(name: string, ratedW: number): Product {
  return {
    id: `${name}-${ratedW}`,
    sku: name,
    name,
    brand: 'Brand',
    category: 'inverter',
    unit: 'nos',
    wattageWp: null,
    ratedW,
    dcr: false,
    pricePaise: 1,
    costPaise: 1,
    taxRateBp: 1200,
    active: true,
  };
}

describe('quick quote helpers', () => {
  it('reads sizes typed in kW', () => {
    expect(parseKw('5')).toBe(5000);
    expect(parseKw('3,3')).toBe(3300);
    expect(parseKw('0.1')).toBeNull();
    expect(parseKw('')).toBeNull();
  });

  it('reads rupees into paise', () => {
    expect(rupeesToPaise('5,000')).toBe(500_000);
    expect(rupeesToPaise('')).toBe(0);
  });

  it('suggests the smallest inverter that carries the array, on-grid first', () => {
    const list = [
      inverter('Hybrid inverter 5 kW', 5000),
      inverter('On-grid inverter 5 kW', 5000),
      inverter('On-grid inverter 3 kW', 3000),
    ];
    expect(suggestInverter(list, 5400)?.name).toBe('On-grid inverter 5 kW');
    expect(suggestInverter(list, 3000)?.name).toBe('On-grid inverter 3 kW');
    expect(suggestInverter(list, 20_000)?.ratedW).toBe(5000);
  });

  it('suggests several of the largest inverter when one is not enough', () => {
    const list = [inverter('On-grid inverter 5 kW', 5000), inverter('On-grid inverter 3 kW', 3000)];
    expect(suggestInverterRows(list, 4500)).toEqual([
      { productId: 'On-grid inverter 5 kW-5000', quantity: '1' },
    ]);
    expect(suggestInverterRows(list, 18_000)).toEqual([
      { productId: 'On-grid inverter 5 kW-5000', quantity: '3' },
      { productId: 'On-grid inverter 3 kW-3000', quantity: '1' },
    ]);
    expect(suggestInverterRows([], 5000)).toEqual([]);
  });

  it('sends inverter rows only when each has a model and a whole count', () => {
    expect(
      inverterPicksOf([
        { productId: 'a', quantity: '2' },
        { productId: 'b', quantity: '1' },
      ]),
    ).toEqual([
      { productId: 'a', quantity: 2 },
      { productId: 'b', quantity: 1 },
    ]);
    expect(inverterPicksOf([{ productId: null, quantity: '1' }])).toBeNull();
    expect(inverterPicksOf([{ productId: 'a', quantity: '' }])).toBeNull();
    expect(inverterPicksOf([])).toBeNull();
  });
});
