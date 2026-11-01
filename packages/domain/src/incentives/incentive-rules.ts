/**
 * Referral rewards (PRD 5.6) and reseller commission (PRD 4.8): when a reward or a
 * commission is earned, how much it is, and the limits a referral campaign keeps.
 * Money in paise, capacity in Wp, rates in basis points.
 */
import type { ProjectType } from '../epc/stages';

/** The project event that earns a reward or commission. */
export const QUALIFYING_EVENTS = ['project_created', 'advance_paid', 'commissioned'] as const;
export type QualifyingEvent = (typeof QUALIFYING_EVENTS)[number];

export const REFERRAL_REWARD_BASES = ['per_referral', 'per_kw'] as const;
export type ReferralRewardBasis = (typeof REFERRAL_REWARD_BASES)[number];

export const COMMISSION_BASES = ['percent', 'per_kw'] as const;
export type CommissionBasis = (typeof COMMISSION_BASES)[number];

/** Earned rewards wait for approval, then are paid; finance can turn one down. */
export const INCENTIVE_STATUSES = ['pending', 'approved', 'paid', 'rejected'] as const;
export type IncentiveStatus = (typeof INCENTIVE_STATUSES)[number];

/** When each qualifying event happened on a project, or null while it has not. */
export interface ProjectEventDates {
  readonly createdAt: Date;
  readonly advancePaidAt: Date | null;
  readonly commissionedAt: Date | null;
}

export function eventReachedAt(event: QualifyingEvent, dates: ProjectEventDates): Date | null {
  if (event === 'project_created') return dates.createdAt;
  if (event === 'advance_paid') return dates.advancePaidAt;
  return dates.commissionedAt;
}

/** Paise for each kW of capacity, rounded to the paisa. */
function perKw(ratePaise: number, capacityWp: number): number {
  return Math.round((Math.max(0, ratePaise) * Math.max(0, capacityWp)) / 1000);
}

export interface ReferralRewardRule {
  readonly basis: ReferralRewardBasis;
  /** Per referral: the amount. Per kW: the amount for each kW installed. */
  readonly amountPaise: number;
}

export function referralRewardPaise(rule: ReferralRewardRule, capacityWp: number): number {
  return rule.basis === 'per_referral'
    ? Math.max(0, rule.amountPaise)
    : perKw(rule.amountPaise, capacityWp);
}

export interface CommissionRule {
  readonly basis: CommissionBasis;
  /** Percent of the project value, in basis points (500 = 5%). */
  readonly rateBp: number;
  /** For each kW of capacity. */
  readonly perKwPaise: number;
}

export function commissionPaise(
  rule: CommissionRule,
  project: { readonly valuePaise: number; readonly capacityWp: number },
): number {
  if (rule.basis === 'per_kw') return perKw(rule.perKwPaise, project.capacityWp);
  return Math.round((Math.max(0, project.valuePaise) * Math.max(0, rule.rateBp)) / 10_000);
}

export function projectTypeEligible(eligible: readonly ProjectType[], type: ProjectType): boolean {
  return eligible.length === 0 || eligible.includes(type);
}

/** What a campaign has already committed: every reward not turned down. */
export interface ReferralUsage {
  readonly campaignPaise: number;
  readonly customerCount: number;
  readonly customerPaise: number;
}

export interface ReferralLimits {
  readonly budgetPaise: number | null;
  readonly perCustomerCount: number | null;
  readonly perCustomerPaise: number | null;
}

export type LimitResult = 'ok' | 'budget' | 'customer_count' | 'customer_amount';

/**
 * Whether one more reward fits the campaign budget and the referring customer's limits.
 * A reward is never cut down to fit: it is earned in full or not at all.
 */
export function checkReferralLimits(
  amountPaise: number,
  limits: ReferralLimits,
  usage: ReferralUsage,
): LimitResult {
  if (limits.budgetPaise !== null && usage.campaignPaise + amountPaise > limits.budgetPaise) {
    return 'budget';
  }
  if (limits.perCustomerCount !== null && usage.customerCount + 1 > limits.perCustomerCount) {
    return 'customer_count';
  }
  if (
    limits.perCustomerPaise !== null &&
    usage.customerPaise + amountPaise > limits.perCustomerPaise
  ) {
    return 'customer_amount';
  }
  return 'ok';
}

/** Earned, waiting for approval, approved and paid totals over a set of entries. */
export interface IncentiveTotals {
  readonly earnedPaise: number;
  readonly pendingPaise: number;
  readonly approvedPaise: number;
  readonly paidPaise: number;
}

export function incentiveTotals(
  entries: readonly { readonly status: IncentiveStatus; readonly amountPaise: number }[],
): IncentiveTotals {
  const sum = (status: IncentiveStatus) =>
    entries
      .filter((entry) => entry.status === status)
      .reduce((total, entry) => total + entry.amountPaise, 0);
  const pendingPaise = sum('pending');
  const approvedPaise = sum('approved');
  const paidPaise = sum('paid');
  return {
    earnedPaise: pendingPaise + approvedPaise + paidPaise,
    pendingPaise,
    approvedPaise,
    paidPaise,
  };
}

/** Won leads over all closed-or-open leads, in basis points (0 when there are none). */
export function conversionBp(leads: number, won: number): number {
  return leads > 0 ? Math.round((won * 10_000) / leads) : 0;
}
