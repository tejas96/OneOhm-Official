'use client';

import type { SendBody, SendScope } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

export const sendOptionsKey = (scope: SendScope) => ['send-to-customer', 'options', scope];

/** What fits this place, each with the customer's preview; loads when the sheet opens. */
export function useSendOptions(scope: SendScope, enabled: boolean) {
  return useQuery({
    queryKey: sendOptionsKey(scope),
    queryFn: () => expectStatus(api.sendToCustomer.sendOptions({ query: scope }), 200),
    enabled,
  });
}

/** The preview of one request (a delay notice with the reason typed so far). */
export function useSendPreview() {
  return useMutation({
    mutationFn: (body: SendBody) => expectStatus(api.sendToCustomer.sendPreview({ body }), 200),
  });
}

/** Sends one action; every ask lands in "Asked from the customer", so those lists refresh. */
export function useSendAction(scope: SendScope) {
  const t = useTranslations('sendToCustomer');
  const toast = useToast();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: SendBody['request']) =>
      expectStatus(api.sendToCustomer.sendToCustomer({ body: { scope, request } }), 201),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['document-requests'] });
      await client.invalidateQueries({ queryKey: ['send-to-customer'] });
      toast({
        tone: 'success',
        title: result.via === 'chat' ? t('sent') : t('sentTemplate'),
      });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}
