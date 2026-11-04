'use client';

import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

/**
 * "Check location": use the pin the customer sent for a home that already has a point, or
 * ignore it. Either way the ask is done and the card and the property refresh.
 */
export function useLocationReview() {
  const t = useTranslations('documents.requests.location');
  const toast = useToast();
  const client = useQueryClient();
  const done = async (title: string) => {
    await client.invalidateQueries({ queryKey: ['document-requests'] });
    await client.invalidateQueries({ queryKey: ['customers'] });
    toast({ tone: 'success', title });
  };
  const fail = (error: unknown) =>
    toast({ tone: 'error', title: t('failed'), description: describeError(error) });
  return {
    accept: useMutation({
      mutationFn: (id: string) =>
        expectStatus(api.sendToCustomer.acceptLocation({ params: { id }, body: {} }), 200),
      onSuccess: () => done(t('accepted')),
      onError: fail,
    }),
    ignore: useMutation({
      mutationFn: (id: string) =>
        expectStatus(api.sendToCustomer.ignoreLocation({ params: { id }, body: {} }), 200),
      onSuccess: () => done(t('ignored')),
      onError: fail,
    }),
  };
}
