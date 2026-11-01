import { describe, expect, it } from 'vitest';
import { materialShortfall } from './material-shortfall';

describe('materialShortfall', () => {
  it('counts what is held and what is on order before calling an item short', () => {
    expect(
      materialShortfall([
        { productId: 'panel', needed: 12, held: 8, onOrder: 2 },
        { productId: 'inverter', needed: 1, held: 0, onOrder: 1 },
        { productId: 'battery', needed: 1, held: 1, onOrder: 0 },
      ]),
    ).toEqual([{ productId: 'panel', short: 2 }]);
  });

  it('ignores rounding dust', () => {
    expect(
      materialShortfall([{ productId: 'cable', needed: 10, held: 9.9999, onOrder: 0 }]),
    ).toEqual([]);
  });
});
