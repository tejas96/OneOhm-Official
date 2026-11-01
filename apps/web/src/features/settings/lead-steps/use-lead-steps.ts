'use client';

import type { LeadStepRecord } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

export const LEAD_STEPS_KEY = ['lead-steps'] as const;

/** The owner's pipeline steps, in order (PRD 3.3). */
export function useLeadSteps() {
  return useQuery({
    queryKey: LEAD_STEPS_KEY,
    queryFn: () => expectStatus(api.leadSteps.listLeadSteps(), 200),
    staleTime: 60_000,
  });
}

type Change =
  | { readonly kind: 'add'; readonly name: string; readonly stage: LeadStepRecord['stage'] }
  | {
      readonly kind: 'update';
      readonly key: string;
      readonly body: { name?: string; active?: boolean; move?: 'up' | 'down' };
    };

/** Every change answers with the whole list, which replaces the cached one. */
export function useChangeLeadSteps(onDone?: () => void) {
  const t = useTranslations('settings.leadSteps');
  const toast = useToast();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: Change) =>
      change.kind === 'add'
        ? expectStatus(
            api.leadSteps.createLeadStep({ body: { name: change.name, stage: change.stage } }),
            201,
          )
        : expectStatus(
            api.leadSteps.updateLeadStep({ params: { key: change.key }, body: change.body }),
            200,
          ),
    onSuccess: async (steps) => {
      client.setQueryData(LEAD_STEPS_KEY, steps);
      await client.invalidateQueries({ queryKey: ['leads'] });
      onDone?.();
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}
