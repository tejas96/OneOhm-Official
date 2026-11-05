'use client';

import { DELIVERY_STATES, type Delivery } from '@oneohm/api-contracts';
import { EmptyState, ResponsiveTable, Select, type TableColumn } from '@oneohm/design-system/web';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListPager } from '@/components/list-pager';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { formatPhone } from '@/lib/format/contact';
import type { PagingMode } from '@/lib/query/use-list-paging';
import { useChoiceParam } from '@/lib/use-choice-param';
import { useSearchParam } from '@/lib/use-search-param';
import { ServiceSearch } from '../service-search';
import { useDeliveryLog } from '../whatsapp/use-whatsapp';
import { DeliveryStatePill, DeliveryTimes, RetryButton } from './delivery-cells';

const ALL = 'all';
type Filter = Delivery['state'] | typeof ALL;
const FILTERS: readonly Filter[] = [ALL, ...DELIVERY_STATES];

/** The log adds older messages below as the person scrolls, like the other long lists. */
const PAGING: PagingMode = 'more';

const emptyKey = (filter: Filter) => (filter === ALL ? 'empty.all' : 'empty.filtered');

/** WhatsApp numbers read as phone numbers; app alerts go to a person's id. */
function useRecipient() {
  const t = useTranslations('service.log');
  return (delivery: Delivery) =>
    delivery.recipient.startsWith('+')
      ? formatPhone(delivery.recipient)
      : t('appUser', { id: delivery.recipient.slice(0, 8) });
}

/**
 * Every business message OneOhm sent, how far it got, and a way to send a stuck one again.
 * State (`?state=`) and search (`?q=`) are applied on the server to the whole log, which is
 * read a page at a time.
 */
export function MessageLogPanel() {
  const t = useTranslations('service.log');
  const recipient = useRecipient();
  const [filter, setFilter] = useChoiceParam<Filter>('state', FILTERS, ALL);
  const { draft, setDraft, search } = useSearchParam();
  const log = useDeliveryLog(filter === ALL ? undefined : filter, search, PAGING);
  // The state is checked again here, so an older API that ignores it still shows the right
  // rows. The search is not: it also matches customer names the rows do not carry.
  const rows = log.items.filter((row) => filter === ALL || row.state === filter);

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <ServiceSearch
          value={draft}
          onChange={setDraft}
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
        />
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
        {log.total > 0 && (
          <p className="type-body-sm text-ink-faint lg:ml-auto">
            {t('count', { count: log.total })}
          </p>
        )}
      </div>
      {log.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : log.isError ? (
        <LoadError error={log.error} onRetry={log.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Send />}
          title={search ? t('empty.search', { term: search }) : t(emptyKey(filter))}
        />
      ) : (
        <>
          <ResponsiveTable
            caption={t('caption')}
            columns={columns}
            rows={rows}
            rowKey={(delivery) => delivery.id}
          />
          <ListPager paging={log} />
        </>
      )}
    </div>
  );
}
