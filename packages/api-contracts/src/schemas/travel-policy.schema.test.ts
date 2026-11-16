import { DEFAULT_WORKFORCE_POLICY } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { travelPolicySchema } from './travel-policy.schema';

const base = DEFAULT_WORKFORCE_POLICY.travel;

describe('travel policy, automatic site visits', () => {
  it('defaults to on with a 150 m fence', () => {
    const { autoSiteVisits: _a, siteFenceM: _f, ...older } = base;
    expect(travelPolicySchema.parse(older)).toMatchObject({
      autoSiteVisits: true,
      siteFenceM: 150,
    });
  });

  it('keeps the fence between 50 and 1000 m', () => {
    expect(travelPolicySchema.safeParse({ ...base, siteFenceM: 49 }).success).toBe(false);
    expect(travelPolicySchema.safeParse({ ...base, siteFenceM: 1001 }).success).toBe(false);
    expect(travelPolicySchema.safeParse({ ...base, siteFenceM: 50 }).success).toBe(true);
    expect(travelPolicySchema.safeParse({ ...base, siteFenceM: 1000 }).success).toBe(true);
    expect(travelPolicySchema.safeParse({ ...base, siteFenceM: 150.5 }).success).toBe(false);
  });
});

describe('travel policy, start place and commute', () => {
  it('defaults to 5 km for a known start and no commute taken off', () => {
    const { baseStartMaxKm: _b, commuteDeductKm: _c, ...older } = base;
    expect(travelPolicySchema.parse(older)).toMatchObject({
      baseStartMaxKm: 5,
      commuteDeductKm: 0,
    });
  });

  it('keeps the known-start distance between 1 and 50 km', () => {
    const check = (baseStartMaxKm: number) =>
      travelPolicySchema.safeParse({ ...base, baseStartMaxKm }).success;
    expect([check(0.5), check(1), check(50), check(51)]).toEqual([false, true, true, false]);
  });

  it('keeps the commute between 0 and 50 km', () => {
    const check = (commuteDeductKm: number) =>
      travelPolicySchema.safeParse({ ...base, commuteDeductKm }).success;
    expect([check(-1), check(0), check(50), check(50.5)]).toEqual([false, true, true, false]);
  });
});
