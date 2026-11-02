import type { Product } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { picksFromRows, rowsFromInput, rowsTotalW, suggestInverters } from './inverter-rows-state';

const inverter = (id: string, ratedW: number, extra: Partial<Product> = {}) =>
  ({
    id,
    sku: id,
    name: `Inverter ${ratedW / 1000} kW`,
    active: true,
    ratedW,
    pricePaise: ratedW * 10,
    ...extra,
  }) as Product;

const catalog = [inverter('i3', 3000), inverter('i5', 5000), inverter('i50', 50_000)];

describe('inverter rows', () => {
  it('reads an older single inverter as one row', () => {
    expect(rowsFromInput({ inverterProductId: 'i5' })).toEqual([
      { productId: 'i5', quantity: '1' },
    ]);
  });

  it('gives picks only when every row is complete', () => {
    expect(
      picksFromRows([
        { productId: 'i5', quantity: '2' },
        { productId: 'i3', quantity: '1' },
      ]),
    ).toEqual([
      { productId: 'i5', quantity: 2 },
      { productId: 'i3', quantity: 1 },
    ]);
    expect(picksFromRows([{ productId: null, quantity: '1' }])).toBeNull();
    expect(picksFromRows([{ productId: 'i5', quantity: '0' }])).toBeNull();
    expect(picksFromRows([{ productId: 'i5', quantity: '1.5' }])).toBeNull();
    expect(picksFromRows([])).toBeNull();
  });

  it('adds the same model on two rows together', () => {
    expect(
      picksFromRows([
        { productId: 'i5', quantity: '1' },
        { productId: 'i5', quantity: '2' },
      ]),
    ).toEqual([{ productId: 'i5', quantity: 3 }]);
  });

  it('suggests one inverter that fits, else several of the largest', () => {
    expect(suggestInverters(catalog, 4800, 'on_grid')).toEqual([
      { productId: 'i5', quantity: '1' },
    ]);
    expect(suggestInverters(catalog, 115_000, 'on_grid')).toEqual([
      { productId: 'i50', quantity: '2' },
      { productId: 'i5', quantity: '3' },
    ]);
    expect(suggestInverters([], 5000, 'on_grid')).toEqual([]);
  });

  it('adds up the AC rating of complete rows', () => {
    expect(
      rowsTotalW(
        [
          { productId: 'i5', quantity: '2' },
          { productId: 'i3', quantity: '1' },
          { productId: null, quantity: '4' },
        ],
        catalog,
      ),
    ).toBe(13_000);
  });
});
