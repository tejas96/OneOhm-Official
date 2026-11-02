import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAD_ASSIGNMENT, isLeadAssignmentRules } from './lead-assignment';

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
