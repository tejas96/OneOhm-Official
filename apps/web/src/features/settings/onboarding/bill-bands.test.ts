import { describe, expect, it } from 'vitest';
import { addBand, canAddBand, canRemoveBand, removeBand } from './bill-bands';

const band = (id: string, maxRupees: number | null) => ({
  id,
  label: id,
  targetWp: 1000,
  maxRupees,
});

describe('bill choices', () => {
  it('adds a new choice above an open-ended last one, so it stays last', () => {
    const bands = addBand([band('a', 1000), band('b', null)], 'new');
    expect(bands.map((row) => row.id)).toEqual(['a', 'new', 'b']);
    expect(bands[1]).toMatchObject({ label: '', maxRupees: null, targetWp: null });
  });

  it('adds at the end when the last choice has a limit', () => {
    expect(addBand([band('a', 1000), band('b', 2000)], 'new').map((row) => row.id)).toEqual([
      'a',
      'b',
      'new',
    ]);
  });

  it('keeps between 2 and 8 choices', () => {
    const eight = Array.from({ length: 8 }, (_, i) => band(`b${i}`, i * 1000 + 1000));
    expect(canAddBand(eight)).toBe(false);
    expect(addBand(eight, 'new')).toHaveLength(8);
    const two = [band('a', 1000), band('b', null)];
    expect(canRemoveBand(two)).toBe(false);
    expect(removeBand(two, 0)).toHaveLength(2);
    expect(removeBand([...two, band('c', null)], 1).map((row) => row.id)).toEqual(['a', 'c']);
  });
});
