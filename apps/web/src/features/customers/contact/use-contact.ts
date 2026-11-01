'use client';

import type { Handover } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import type { ContactChannel } from '@oneohm/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

const contactKey = (customerId: string) => ['customers', customerId, 'contact'];
export const HANDOVERS_KEY = ['handovers'] as const;

export function useCustomerContact(customerId: string) {
  return useQuery({
    queryKey: contactKey(customerId),
    queryFn: () =>
      expectStatus(api.customerContact.customerContact({ params: { id: customerId } }), 200),
  });
}

export function useSetContact(customerId: string) {
  const t = useTranslations('customers.contact');
  const toast = useToast();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { channel?: ContactChannel; tryWhatsAppAgain?: boolean }) =>
      expectStatus(
        api.customerContact.setCustomerContact({ params: { id: customerId }, body }),
        200,
      ),
    onSuccess: (contact) => {
      client.setQueryData(contactKey(customerId), contact);
      toast({ tone: 'success', title: t('saved') });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}

/** Open "share in person" items, for one customer or for everyone. */
export function useHandovers(customerId?: string) {
  return useQuery({
    queryKey: [...HANDOVERS_KEY, customerId ?? 'all'],
    queryFn: () =>
      expectStatus(
        api.customerContact.listHandovers({
          query: { status: 'open', ...(customerId ? { customerId } : {}) },
        }),
        200,
      ),
  });
}

export function useCompleteHandover() {
  const t = useTranslations('customers.handovers');
  const toast = useToast();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (item: Handover) =>
      expectStatus(
        api.customerContact.completeHandover({ params: { id: item.id }, body: {} }),
        200,
      ),
    onSuccess: async (item) => {
      await client.invalidateQueries({ queryKey: HANDOVERS_KEY });
      toast({ tone: 'success', title: t('done'), description: item.title });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}
