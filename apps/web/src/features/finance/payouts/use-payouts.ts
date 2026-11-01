'use client';

import type {
  CommissionEntry,
  IncentiveFilter,
  PayoutInput,
  ReferralReward,
} from '@oneohm/api-contracts';
import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

/** Reseller commission or a customer's referral reward. */
export type PayoutKind = 'commissions' | 'referrals';

/** What a dialog needs to know about the payout it acts on. */
export interface PayoutTarget {
  readonly kind: PayoutKind;
  readonly id: string;
  readonly amountPaise: number;
  readonly party: string;
}

export const payoutKeys = {
  all: ['finance', 'payouts'] as const,
  list: (kind: PayoutKind, status: IncentiveFilter) =>
    ['finance', 'payouts', kind, status] as const,
};

export const useCommissionEntries = (status: IncentiveFilter, enabled: boolean) =>
  useQuery({
    queryKey: payoutKeys.list('commissions', status),
    queryFn: () => expectStatus(api.commissions.listEntries({ query: { status } }), 200),
    enabled,
  });

export const useReferralRewards = (status: IncentiveFilter, enabled: boolean) =>
  useQuery({
    queryKey: payoutKeys.list('referrals', status),
    queryFn: () => expectStatus(api.referrals.listRewards({ query: { status } }), 200),
    enabled,
  });

const params = (target: PayoutTarget) => ({ params: { id: target.id } });

type Done = Promise<CommissionEntry | ReferralReward>;

export async function approvePayout(target: PayoutTarget): Done {
  return target.kind === 'commissions'
    ? expectStatus(api.commissions.approveEntry({ ...params(target), body: {} }), 200)
    : expectStatus(api.referrals.approveReward({ ...params(target), body: {} }), 200);
}

export async function rejectPayout(target: PayoutTarget, reason: string): Done {
  return target.kind === 'commissions'
    ? expectStatus(api.commissions.rejectEntry({ ...params(target), body: { reason } }), 200)
    : expectStatus(api.referrals.rejectReward({ ...params(target), body: { reason } }), 200);
}

export async function payPayout(target: PayoutTarget, body: PayoutInput): Done {
  return target.kind === 'commissions'
    ? expectStatus(api.commissions.payEntry({ ...params(target), body }), 200)
    : expectStatus(api.referrals.payReward({ ...params(target), body }), 200);
}
