import { describe, expect, it } from 'vitest';
import { programProblems } from './referral-program';

const input = {
  active: true,
  basis: 'per_referral' as const,
  amountPaise: 50_000,
};

describe('referral programme check', () => {
  it('accepts a programme that is on with a reward', () => {
    expect(programProblems(input)).toBeNull();
  });

  it('refuses a programme that is on with a ₹0 reward', () => {
    expect(programProblems({ ...input, amountPaise: 0 })).toHaveProperty('amountPaise');
  });

  it('lets a programme that is off keep a ₹0 reward', () => {
    expect(programProblems({ ...input, active: false, amountPaise: 0 })).toBeNull();
  });
});
