import { describe, expect, it } from 'vitest';
import { cleanCityOwners, DEFAULT_LEAD_ASSIGNMENT, isLeadAssignmentRules } from './lead-assignment';

describe('isLeadAssignmentRules', () => {
  it('accepts the default', () => {
    expect(isLeadAssignmentRules(DEFAULT_LEAD_ASSIGNMENT)).toBe(true);
  });

  it('rejects an unknown strategy, a cities value that is not an array, and an empty userId', () => {
    expect(isLeadAssignmentRules({ strategy: 'random', cityOwners: [] })).toBe(false);
    expect(
      isLeadAssignmentRules({
        strategy: 'least_busy',
        cityOwners: [{ userId: 'a', cities: 'Pune' }],
      }),
    ).toBe(false);
    expect(
      isLeadAssignmentRules({
        strategy: 'least_busy',
        cityOwners: [{ userId: ' ', cities: [] }],
      }),
    ).toBe(false);
  });

  it('accepts at most 50 cities per person', () => {
    const cities = (count: number) => Array.from({ length: count }, (_, i) => `City ${i}`);
    const rules = (count: number) => ({
      strategy: 'round_robin',
      cityOwners: [{ userId: 'a', cities: cities(count) }],
    });
    expect(isLeadAssignmentRules(rules(50))).toBe(true);
    expect(isLeadAssignmentRules(rules(51))).toBe(false);
  });
});

describe('cleanCityOwners', () => {
  const canOwn = new Set(['a', 'b']);
  it('trims cities, drops repeats and blanks', () => {
    const out = cleanCityOwners(
      [{ userId: 'a', cities: [' Pune', 'Pune ', ''] }],
      canOwn,
      new Set(),
    );
    expect(out.kept).toEqual([{ userId: 'a', cities: ['Pune'] }]);
    expect(out.blank).toEqual([]);
  });

  it('names a person left with no city instead of quietly dropping them', () => {
    const out = cleanCityOwners([{ userId: 'b', cities: [' ', ''] }], canOwn, new Set());
    expect(out.blank).toEqual(['b']);
    expect(out.kept).toEqual([]);
  });

  it('drops a saved owner who no longer works on leads, refuses a new one', () => {
    const owners = [
      { userId: 'gone', cities: ['Nashik'] },
      { userId: 'new', cities: ['Satara'] },
    ];
    const out = cleanCityOwners(owners, canOwn, new Set(['gone']));
    expect(out.dropped).toEqual(['gone']);
    expect(out.refused).toEqual(['new']);
    expect(out.kept).toEqual([]);
  });
});
