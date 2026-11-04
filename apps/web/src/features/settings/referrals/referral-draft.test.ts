import { describe, expect, it } from 'vitest';
import { programChecks, switchBasis } from './referral-draft';

const draft = {
  active: true,
  basis: 'per_referral' as const,
  amountPaise: 50_000,
  perCustomerCount: null,
};

describe('referral programme draft', () => {
  it('clears the amount when the reward basis changes', () => {
    expect(switchBasis(draft, 'per_kw')).toEqual({ basis: 'per_kw', amountPaise: 0 });
    expect(switchBasis(draft, 'per_referral')).toEqual({});
  });

  it('asks for a reward when the programme is on', () => {
    expect(programChecks({ ...draft, amountPaise: 0 })).toEqual({ amountPaise: 'positiveAmount' });
    expect(programChecks({ ...draft, active: false, amountPaise: 0 })).toEqual({});
  });

  it('treats 0 rewards per customer as a mistake, not as no limit', () => {
    expect(programChecks({ ...draft, perCustomerCount: 0 })).toEqual({
      perCustomerCount: 'positiveNumber',
    });
    expect(programChecks(draft)).toEqual({});
  });
});
