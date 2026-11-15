import { describe, expect, it } from 'vitest';
import { FENCE_MAX, fenceWanted, regionsFor, sameRegions } from './fence-regions';

const site = (id: string, latitude = 16.85) => ({
  id,
  kind: 'installation' as const,
  label: `Site ${id}`,
  latitude,
  longitude: 74.58,
  radiusM: 150,
});

describe('regionsFor', () => {
  it('names each region by its site and gives the fence radius', () => {
    expect(regionsFor([site('t1')])).toEqual([
      {
        identifier: 't1',
        latitude: 16.85,
        longitude: 74.58,
        radius: 150,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
  });

  it('keeps at most 18, below the iPhone limit of 20', () => {
    const many = Array.from({ length: 25 }, (_, index) => site(`t${index}`));
    expect(FENCE_MAX).toBe(18);
    expect(regionsFor(many)).toHaveLength(18);
  });
});

describe('sameRegions', () => {
  it('ignores order and sees a moved pin', () => {
    const a = regionsFor([site('a'), site('b')]);
    expect(sameRegions(a, regionsFor([site('b'), site('a')]))).toBe(true);
    expect(sameRegions(a, regionsFor([site('a'), site('b', 16.9)]))).toBe(false);
    expect(sameRegions(a, regionsFor([site('a')]))).toBe(false);
  });
});

describe('fenceWanted', () => {
  it('needs duty, the all-the-time permission and a site', () => {
    expect(fenceWanted({ onDuty: true, backgroundAllowed: true, sites: 2 })).toBe(true);
    expect(fenceWanted({ onDuty: false, backgroundAllowed: true, sites: 2 })).toBe(false);
    expect(fenceWanted({ onDuty: true, backgroundAllowed: false, sites: 2 })).toBe(false);
    expect(fenceWanted({ onDuty: true, backgroundAllowed: true, sites: 0 })).toBe(false);
  });
});
