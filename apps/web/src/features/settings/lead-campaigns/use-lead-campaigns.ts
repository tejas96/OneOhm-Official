'use client';

import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

export const LEAD_CAMPAIGNS_KEY = ['lead-campaigns'] as const;

/** The owner's ad and campaign codes. */
export function useLeadCampaigns() {
  return useQuery({
    queryKey: LEAD_CAMPAIGNS_KEY,
    queryFn: () => expectStatus(api.leadCampaigns.listLeadCampaigns(), 200),
    staleTime: 60_000,
  });
}

type Change =
  | { readonly kind: 'add'; readonly code: string; readonly name: string }
  | {
      readonly kind: 'update';
      readonly code: string;
      readonly body: { name?: string; active?: boolean };
    };

/** Every change answers with the whole list, which replaces the cached one. */
export function useChangeLeadCampaigns(onDone?: () => void) {
  const t = useTranslations('settings.leadCampaigns');
  const toast = useToast();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: Change) =>
      change.kind === 'add'
        ? expectStatus(
            api.leadCampaigns.createLeadCampaign({
              body: { code: change.code, name: change.name },
            }),
            201,
          )
        : expectStatus(
            api.leadCampaigns.updateLeadCampaign({
              params: { code: change.code },
              body: change.body,
            }),
            200,
          ),
    onSuccess: (campaigns) => {
      client.setQueryData(LEAD_CAMPAIGNS_KEY, campaigns);
      onDone?.();
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}
