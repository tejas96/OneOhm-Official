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
