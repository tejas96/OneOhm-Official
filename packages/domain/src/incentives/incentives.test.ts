import { describe, expect, it } from 'vitest';
import { incentiveApprovedPosting, incentivePaidPosting } from '../finance/incentive-postings';
import { isBalanced } from '../finance/ledger-postings';
import {
  checkReferralLimits,
  commissionPaise,
  conversionBp,
  eventReachedAt,
  incentiveTotals,
  projectTypeEligible,
  referralRewardPaise,
} from './incentive-rules';
import { findReferralCode, makeReferralCode, normaliseReferralCode } from './referral-code';

const NO_LIMITS = { budgetPaise: null, perCustomerCount: null, perCustomerPaise: null };
const NOTHING_USED = { campaignPaise: 0, customerCount: 0, customerPaise: 0 };

describe('qualifying events', () => {
  const createdAt = new Date('2026-10-01T05:00:00Z');
  const advancePaidAt = new Date('2026-10-03T05:00:00Z');

  it('finds when each event happened, or null before it has', () => {
    const dates = { createdAt, advancePaidAt, commissionedAt: null };
    expect(eventReachedAt('project_created', dates)).toBe(createdAt);
    expect(eventReachedAt('advance_paid', dates)).toBe(advancePaidAt);
    expect(eventReachedAt('commissioned', dates)).toBeNull();
  });
});

describe('reward and commission amounts', () => {
  it('pays a flat amount per referral whatever the size', () => {
    expect(referralRewardPaise({ basis: 'per_referral', amountPaise: 200_000 }, 3270)).toBe(
      200_000,
    );
  });

  it('pays per kW of installed capacity, to the paisa', () => {
    expect(referralRewardPaise({ basis: 'per_kw', amountPaise: 50_000 }, 3270)).toBe(163_500);
  });

  it('takes a percent of the project value in basis points', () => {
    const rule = { basis: 'percent' as const, rateBp: 300, perKwPaise: 0 };
    expect(commissionPaise(rule, { valuePaise: 18_500_000, capacityWp: 3270 })).toBe(555_000);
  });

  it('pays commission per kW when the rule says so', () => {
    const rule = { basis: 'per_kw' as const, rateBp: 300, perKwPaise: 100_000 };
    expect(commissionPaise(rule, { valuePaise: 18_500_000, capacityWp: 4360 })).toBe(436_000);
  });

  it('treats an empty eligibility list as every project type', () => {
    expect(projectTypeEligible([], 'commercial')).toBe(true);
    expect(projectTypeEligible(['residential'], 'society')).toBe(false);
  });
});

describe('referral limits', () => {
  it('lets a reward through when nothing limits it', () => {
    expect(checkReferralLimits(200_000, NO_LIMITS, NOTHING_USED)).toBe('ok');
  });

  it('never goes over the campaign budget, not even partly', () => {
    const limits = { ...NO_LIMITS, budgetPaise: 1_000_000 };
    expect(checkReferralLimits(200_000, limits, { ...NOTHING_USED, campaignPaise: 800_000 })).toBe(
      'ok',
    );
    expect(checkReferralLimits(200_000, limits, { ...NOTHING_USED, campaignPaise: 900_000 })).toBe(
      'budget',
    );
  });

  it('stops at the per-customer count and amount', () => {
    const usage = { campaignPaise: 0, customerCount: 3, customerPaise: 600_000 };
    expect(checkReferralLimits(200_000, { ...NO_LIMITS, perCustomerCount: 3 }, usage)).toBe(
      'customer_count',
    );
    expect(checkReferralLimits(200_000, { ...NO_LIMITS, perCustomerPaise: 700_000 }, usage)).toBe(
      'customer_amount',
    );
  });
});

describe('totals and conversion', () => {
  it('counts pending, approved and paid as earned; rejected not at all', () => {
    expect(
      incentiveTotals([
        { status: 'pending', amountPaise: 100 },
        { status: 'approved', amountPaise: 200 },
        { status: 'paid', amountPaise: 300 },
        { status: 'rejected', amountPaise: 999 },
      ]),
    ).toEqual({ earnedPaise: 600, pendingPaise: 100, approvedPaise: 200, paidPaise: 300 });
  });

  it('gives conversion in basis points', () => {
    expect(conversionBp(8, 3)).toBe(3750);
    expect(conversionBp(0, 0)).toBe(0);
  });
});

describe('referral codes', () => {
  it('starts with the first name and avoids look-alike characters', () => {
    const code = makeReferralCode('Ramesh Patil (test)', () => 0.5);
    expect(code).toMatch(/^RAME[2-9A-HJKMNP-Z]{4}$/);
    expect(makeReferralCode('रमेश', () => 0)).toMatch(/^OH/);
  });

  it('reads a code in a WhatsApp message, in any case', () => {
    expect(findReferralCode('Hi OneOhm, my referral code is rame7k2q')).toBe('RAME7K2Q');
    expect(findReferralCode('Code: RAME7K2Q, please call')).toBe('RAME7K2Q');
    expect(findReferralCode('I want solar for my home')).toBeNull();
    expect(normaliseReferralCode(' rame-7k2q ')).toBe('RAME7K2Q');
  });
});

describe('incentive postings', () => {
  it('books the expense on approval and the bank on payment', () => {
    const approved = incentiveApprovedPosting({ kind: 'referral_reward', amountPaise: 200_000 });
    expect(isBalanced(approved)).toBe(true);
    expect(approved[0]?.account).toBe('5030');
    expect(incentiveApprovedPosting({ kind: 'commission', amountPaise: 1 })[0]?.account).toBe(
      '5040',
    );
    const paid = incentivePaidPosting({ method: 'upi', amountPaise: 200_000 });
    expect(isBalanced(paid)).toBe(true);
    expect(paid.map((line) => line.account)).toEqual(['2020', '1000']);
  });
});
