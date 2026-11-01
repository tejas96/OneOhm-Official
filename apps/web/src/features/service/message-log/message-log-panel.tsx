'use client';

import { DELIVERY_STATES, type Delivery } from '@oneohm/api-contracts';
import { EmptyState, ResponsiveTable, Select, type TableColumn } from '@oneohm/design-system/web';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { formatPhone } from '@/lib/format/contact';
import { useDeliveries } from '../whatsapp/use-whatsapp';
import { DeliveryStatePill, DeliveryTimes, RetryButton } from './delivery-cells';

const ALL = 'all';
type Filter = Delivery['state'] | typeof ALL;

/** WhatsApp numbers read as phone numbers; app alerts go to a person's id. */
function useRecipient() {
  const t = useTranslations('service.log');
  return (delivery: Delivery) =>
    delivery.recipient.startsWith('+')
      ? formatPhone(delivery.recipient)
      : t('appUser', { id: delivery.recipient.slice(0, 8) });
}

/** Every business message OneOhm sent, how far it got, and a way to send a stuck one again. */
export function MessageLogPanel() {
  const t = useTranslations('service.log');
  const recipient = useRecipient();
  const [filter, setFilter] = useState<Filter>(ALL);
  const deliveries = useDeliveries(filter === ALL ? undefined : filter);

  const columns: readonly TableColumn<Delivery>[] = [
    {
      key: 'message',
      header: t('columns.message'),
      primary: true,
      cell: (delivery) => (
        <span className="flex flex-col gap-0.5">
          <span className="type-body font-medium text-ink">{t(`channel.${delivery.channel}`)}</span>
          <span className="font-mono text-[0.75rem] text-ink-faint [overflow-wrap:anywhere]">
            {delivery.template}
          </span>
        </span>
      ),
    },
    {
      key: 'recipient',
      header: t('columns.recipient'),
      cell: (delivery) => (
        <span className="whitespace-nowrap tabular-nums">{recipient(delivery)}</span>
      ),
    },
    {
      key: 'state',
      header: t('columns.state'),
      cell: (delivery) => <DeliveryStatePill state={delivery.state} />,
    },
    {
      key: 'attempts',
      header: t('columns.attempts'),
      align: 'end',
      cell: (delivery) => <span className="tabular-nums">{delivery.attempts}</span>,
    },
    {
      key: 'error',
      header: t('columns.error'),
      className: 'md:max-w-[16rem]',
      cell: (delivery) =>
        delivery.lastError ? (
          <span className="type-body-sm text-ink-muted">{delivery.lastError}</span>
        ) : (
          <span className="type-body-sm text-ink-faint">{t('noError')}</span>
        ),
    },
    {
      key: 'times',
      header: t('columns.times'),
      cell: (delivery) => <DeliveryTimes delivery={delivery} />,
    },
    {
      key: 'actions',
      header: t('columns.action'),
      align: 'end',
      cell: (delivery) =>
        delivery.state === 'failed' || delivery.state === 'skipped' ? (
          <RetryButton id={delivery.id} />
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select<Filter>
          label={t('filterLabel')}
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: ALL, label: t('all') },
            ...DELIVERY_STATES.map((state) => ({ value: state, label: t(`state.${state}`) })),
          ]}
          className="w-full sm:w-56"
        />
        {deliveries.data && deliveries.data.length > 0 && (
          <p className="type-body-sm text-ink-faint">
            {t('count', { count: deliveries.data.length })}
          </p>
        )}
      </div>
      {deliveries.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : deliveries.isError ? (
        <LoadError error={deliveries.error} onRetry={() => deliveries.refetch()} />
      ) : deliveries.data.length === 0 ? (
        <EmptyState icon={<Send />} title={filter === ALL ? t('empty.all') : t('empty.filtered')} />
      ) : (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={deliveries.data}
          rowKey={(delivery) => delivery.id}
        />
      )}
    </div>
  );
}
