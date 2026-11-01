'use client';

import type { Delivery } from '@oneohm/api-contracts';
import { Button, type PillTone, StatusPill, useToast } from '@oneohm/design-system/web';
import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { describeError } from '@/lib/api/api-error';
import { useAgo } from '../use-ago';
import { useRetryDelivery } from '../whatsapp/use-whatsapp';

const TONE: Readonly<Record<Delivery['state'], PillTone>> = {
  pending: 'waiting',
  skipped: 'neutral',
  sent: 'onTrack',
  delivered: 'onTrack',
  read: 'done',
  failed: 'overdue',
};

export function DeliveryStatePill({ state }: { readonly state: Delivery['state'] }) {
  const t = useTranslations('service.log.state');
  return <StatusPill size="sm" tone={TONE[state]} label={t(state)} />;
}

/** When it was queued, then the furthest step it reached. */
export function DeliveryTimes({ delivery }: { readonly delivery: Delivery }) {
  const t = useTranslations('service.log');
  const ago = useAgo();
  const latest = delivery.readAt
    ? t('readAt', { time: ago(delivery.readAt) })
    : delivery.deliveredAt
      ? t('deliveredAt', { time: ago(delivery.deliveredAt) })
      : delivery.sentAt
        ? t('sentAt', { time: ago(delivery.sentAt) })
        : null;
  return (
    <span className="flex flex-col gap-0.5 whitespace-nowrap md:items-start">
      <time dateTime={delivery.createdAt} className="type-body-sm text-ink">
        {t('queued', { time: ago(delivery.createdAt) })}
      </time>
      {latest && <span className="type-label text-ink-faint">{latest}</span>}
    </span>
  );
}

/** Puts a failed or skipped message back in the queue. */
export function RetryButton({ id }: { readonly id: string }) {
  const t = useTranslations('service.log');
  const toast = useToast();
  const retry = useRetryDelivery();
  return (
    <Button
      size="sm"
      variant="quiet"
      leadingIcon={<RotateCw />}
      pending={retry.isPending}
      onClick={() =>
        retry.mutate(id, {
          onSuccess: () => toast({ tone: 'success', title: t('retried') }),
          onError: (error) =>
            toast({ tone: 'error', title: t('retryFailed'), description: describeError(error) }),
        })
      }
    >
      {t('retry')}
    </Button>
  );
}
