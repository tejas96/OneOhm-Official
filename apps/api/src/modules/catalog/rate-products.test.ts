import { describe, expect, it } from 'vitest';
import { rateLinesUsing, rateProductProblem } from './rate-products';

const lines = [
  { label: 'DC cable', productId: 'dc' },
  { label: 'Labour', productId: null },
  { label: 'AC cable', productId: 'ac' },
];

describe('rateProductProblem', () => {
  it('names the first rate line whose product is missing or archived', () => {
    expect(rateProductProblem(lines, [{ id: 'dc', active: true }])).toEqual({
      index: 2,
      archived: false,
    });
    expect(
      rateProductProblem(lines, [
        { id: 'dc', active: true },
        { id: 'ac', active: false },
      ]),
    ).toEqual({ index: 2, archived: true });
  });

  it('finds nothing when every linked product is in use', () => {
    expect(
      rateProductProblem(lines, [
        { id: 'dc', active: true },
        { id: 'ac', active: true },
      ]),
    ).toBeNull();
  });
});

describe('rateLinesUsing', () => {
  it('lists the rate lines linked to a product', () => {
    expect(rateLinesUsing(lines, 'ac')).toEqual(['AC cable']);
  });
});
