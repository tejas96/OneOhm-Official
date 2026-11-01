'use client';

import type { PaymentPlan } from '@oneohm/api-contracts';
import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const PLANS_KEY = ['settings', 'payment-plans'] as const;

export function usePaymentPlans(enabled = true) {
  return useQuery({
    queryKey: PLANS_KEY,
    queryFn: () => expectStatus(api.paymentPlans.list(), 200),
    enabled,
  });
}

/** "25 / 65 / 10" for a plan's shares. */
export function shareSummary(plan: Pick<PaymentPlan, 'steps'>): string {
  return plan.steps.map((step) => `${Math.round(step.shareBp / 100)}`).join(' / ');
}
