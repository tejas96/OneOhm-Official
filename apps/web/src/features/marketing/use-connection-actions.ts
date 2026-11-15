'use client';

import type { MarketingConnections } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { marketingKeys } from './use-marketing';

type Provider = 'meta' | 'google';

/** Connect, choose, disconnect, send a message for approval: each keeps Connections in step. */
export function useConnectionActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('marketing');
  const keep = (next: MarketingConnections) => {
    queryClient.setQueryData(marketingKeys.connections, next);
    void queryClient.invalidateQueries({ queryKey: marketingKeys.overview });
    void queryClient.invalidateQueries({ queryKey: marketingKeys.defaults });
  };
  const failed = (error: unknown) =>
    toast({ title: t('toast.connectionFailed'), description: describeError(error), tone: 'error' });

  return {
    start: useMutation({
      mutationFn: (provider: Provider) =>
        expectStatus(api.marketing.connectStart({ params: { provider }, body: {} }), 200),
      onSuccess: ({ url }) => {
        window.location.href = url;
      },
      onError: failed,
    }),
    choose: useMutation({
      mutationFn: (input: { provider: Provider; accountId: string; pageId?: string }) =>
        expectStatus(
          api.marketing.choose({
            params: { provider: input.provider },
            body: { accountId: input.accountId, ...(input.pageId ? { pageId: input.pageId } : {}) },
          }),
          200,
        ),
      onSuccess: (next) => {
        keep(next);
        toast({ title: t('toast.chosen'), tone: 'success' });
      },
      onError: failed,
    }),
    disconnect: useMutation({
      mutationFn: (provider: Provider) =>
        expectStatus(api.marketing.disconnect({ params: { provider }, body: {} }), 200),
      onSuccess: (next) => {
        keep(next);
        toast({ title: t('toast.disconnected'), tone: 'success' });
      },
      onError: failed,
    }),
    submitTemplate: useMutation({
      mutationFn: (key: string) =>
        expectStatus(api.marketing.submitTemplate({ params: { key }, body: {} }), 200),
      onSuccess: (next) => {
        keep(next);
        toast({ title: t('toast.templateSent'), tone: 'success' });
      },
      onError: failed,
    }),
  };
}
