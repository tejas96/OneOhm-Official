'use client';

import type { SendBody, SendScope } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

/** A fresh id for one press of Send; `crypto.randomUUID` needs a secure origin, so fall back. */
export function newPressId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
  // One id per press: a double tap or a retry is the same send. A new one starts after it went.
  const pressId = useRef(newPressId());
  return useMutation({
    mutationFn: (request: SendBody['request']) =>
      expectStatus(
        api.sendToCustomer.sendToCustomer({
          body: { scope, request, requestId: pressId.current },
        }),
        201,
      ),
    onSuccess: async (result) => {
      pressId.current = newPressId();
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
