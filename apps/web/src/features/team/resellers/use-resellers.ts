'use client';

import type { CommissionRule, CommissionRuleInput } from '@oneohm/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const RESELLER_KEYS = {
  all: ['resellers'],
  performance: ['resellers', 'performance'],
  defaultRule: ['resellers', 'default-rule'],
} as const;

export const useResellerPerformance = () =>
  useQuery({
    queryKey: RESELLER_KEYS.performance,
    queryFn: () => expectStatus(api.commissions.performance(), 200),
  });

export const useDefaultCommissionRule = () =>
  useQuery({
    queryKey: RESELLER_KEYS.defaultRule,
    queryFn: () => expectStatus(api.commissions.defaultRule(), 200),
  });

/** Who a rule is for: the default (null) or one reseller. */
export type RuleTarget = { readonly id: string; readonly fullName: string } | null;

/** Saves the default or a reseller's own rule, or puts a reseller back on the default. */
export function useSaveCommissionRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      target: RuleTarget;
      rule: CommissionRuleInput | 'default';
    }): Promise<CommissionRule> => {
      const { target, rule } = input;
      if (!target) {
        if (rule === 'default') throw new Error('The default rule cannot follow itself.');
        return expectStatus(api.commissions.saveDefaultRule({ body: rule }), 200);
      }
      if (rule === 'default') {
        return expectStatus(
          api.commissions.clearResellerRule({ params: { resellerId: target.id } }),
          200,
        );
      }
      return expectStatus(
        api.commissions.saveResellerRule({ params: { resellerId: target.id }, body: rule }),
        200,
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: RESELLER_KEYS.all });
      await client.invalidateQueries({ queryKey: ['finance', 'payouts'] });
    },
  });
}
