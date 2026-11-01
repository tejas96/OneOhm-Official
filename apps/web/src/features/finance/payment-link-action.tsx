'use client';

import type { OpenLink } from '@oneohm/api-contracts';
import { Badge, Button, useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { FINANCE_KEY } from './use-finance';

/** Whether online links are on; asked once and kept. */
export function useOnlinePayments() {
  return useQuery({
    queryKey: [...FINANCE_KEY, 'online-payments'],
    queryFn: () => expectStatus(api.paymentLinks.setup(), 200),
    staleTime: 10 * 60_000,
  });
}

/**
 * Send a Razorpay link for what a customer still owes on a milestone, or, once sent,
 * copy or cancel it. Hidden while online payments are off or for the bank's share.
 */
export function PaymentLinkAction({
  milestoneId,
  link,
}: {
  readonly milestoneId: string;
  readonly link: OpenLink;
}) {
  const t = useTranslations('finance.links');
  const toast = useToast();
  const client = useQueryClient();
  const canSend = useCan('finance.record_payments');
  const setup = useOnlinePayments();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: FINANCE_KEY }),
      client.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  const send = useMutation({
    mutationFn: () => expectStatus(api.paymentLinks.create({ params: { id: milestoneId } }), 201),
    onSuccess: async () => {
      await refresh();
      toast({ title: t('sent'), tone: 'success' });
    },
    onError: (error) => toast({ title: describeError(error), tone: 'error' }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => expectStatus(api.paymentLinks.cancel({ params: { id } }), 200),
    onSuccess: async () => {
      await refresh();
      toast({ title: t('cancelled'), tone: 'info' });
    },
    onError: (error) => toast({ title: describeError(error), tone: 'error' }),
  });
  if (!canSend || !setup.data || setup.data.mode === 'off') return null;
  if (!link)
    return (
      <Button
        size="sm"
        variant="secondary"
        className="relative z-[2]"
        leadingIcon={<Link2 />}
        pending={send.isPending}
        onClick={() => send.mutate()}
      >
        {t('send')}
      </Button>
    );
  return (
    <span className="relative z-[2] inline-flex flex-wrap items-center gap-1.5">
      <Badge variant="soft">{link.sandbox ? t('sentTest') : t('linkSent')}</Badge>
      <Button
        size="sm"
        variant="quiet"
        aria-label={t('copy')}
        leadingIcon={<Copy />}
        onClick={() =>
          void navigator.clipboard
            .writeText(link.url)
            .then(() => toast({ title: t('copied'), tone: 'success' }))
        }
      >
        {t('copyShort')}
      </Button>
      <Button
        size="sm"
        variant="quiet"
        aria-label={t('cancel')}
        leadingIcon={<X />}
        pending={cancel.isPending}
        onClick={() => cancel.mutate(link.id)}
      />
    </span>
  );
}
