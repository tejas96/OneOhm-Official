'use client';

import type { CampaignCard, MarketingOverview } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { changeCard, optimisticCard } from './campaign-change';
import type { CardAction } from './marketing-words';

export const marketingKeys = {
  all: ['marketing'] as const,
  overview: ['marketing', 'overview'] as const,
  defaults: ['marketing', 'defaults'] as const,
  connections: ['marketing', 'connections'] as const,
  campaign: (id: string) => ['marketing', 'campaign', id] as const,
};

/** Every campaign card, alerts, reviews and the 30-day numbers; refreshed each minute. */
export function useMarketingOverview() {
  return useQuery({
    queryKey: marketingKeys.overview,
    queryFn: () => expectStatus(api.marketing.overview(), 200),
    refetchInterval: 60_000,
  });
}

export function useCampaignDefaults(enabled: boolean) {
  return useQuery({
    queryKey: marketingKeys.defaults,
    queryFn: () => expectStatus(api.marketing.defaults(), 200),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useMarketingConnections() {
  return useQuery({
    queryKey: marketingKeys.connections,
    queryFn: () => expectStatus(api.marketing.connections(), 200),
  });
}

export function useCampaignDetail(id: string | null) {
  return useQuery({
    queryKey: marketingKeys.campaign(id ?? ''),
    queryFn: () => expectStatus(api.marketing.campaign({ params: { id: id ?? '' } }), 200),
    enabled: id !== null,
    refetchInterval: 30_000,
  });
}

function send(action: CardAction, id: string) {
  const params = { id };
  const body = {};
  if (action === 'pause') return expectStatus(api.marketing.pause({ params, body }), 200);
  if (action === 'stop') return expectStatus(api.marketing.stop({ params, body }), 200);
  return expectStatus(api.marketing.runAgain({ params, body }), 200);
}

/**
 * Pause, stop or run again. The card changes at once and goes back with a calm message if the
 * server says no; the overview is read again either way.
 */
export function useCampaignAction() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('marketing');
  return useMutation({
    mutationFn: ({ action, id }: { action: CardAction; id: string }) => send(action, id),
    onMutate: async ({ action, id }) => {
      await queryClient.cancelQueries({ queryKey: marketingKeys.overview });
      const before = queryClient.getQueryData<MarketingOverview>(marketingKeys.overview);
      if (before)
        queryClient.setQueryData<MarketingOverview>(marketingKeys.overview, {
          ...before,
          campaigns: changeCard(before.campaigns, id, (card: CampaignCard) =>
            optimisticCard(card, action),
          ),
        });
      return { before };
    },
    onError: (error, _input, context) => {
      if (context?.before) queryClient.setQueryData(marketingKeys.overview, context.before);
      toast({ title: t('toast.actionFailed'), description: describeError(error), tone: 'error' });
    },
    onSuccess: (detail, { action, id }) => {
      queryClient.setQueryData(marketingKeys.campaign(id), detail);
      toast({ title: t(`toast.${action}`), tone: 'success' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: marketingKeys.all }),
  });
}
