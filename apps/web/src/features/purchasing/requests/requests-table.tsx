'use client';

import type { PurchaseRequest } from '@oneohm/api-contracts';
import { ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { formatQuantity } from '../../inventory/use-inventory';
import { RequestStatusPill } from './request-status';

const SHORT = { day: 'numeric', month: 'short' } as const;
const asDate = (value: string) => new Date(`${value}T12:00:00`);

function RequestCell({
  request,
  onOpen,
}: {
  readonly request: PurchaseRequest;
  readonly onOpen: (id: string) => void;
}) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(request.id)}
          className="oh-stretched-link text-left font-mono type-body-sm font-medium text-ink hover:text-accent"
        >
          {request.number}
        </button>
        <RequestStatusPill status={request.status} />
      </span>
      <span className="line-clamp-2 type-body-sm text-ink-muted md:max-w-[20rem]">
        {request.reason}
      </span>
    </span>
  );
}

function ItemsCell({ request }: { readonly request: PurchaseRequest }) {
  const t = useTranslations('purchasing.requests');
  const [first, ...rest] = request.lines;
  if (!first) return null;
  return (
    <span className="flex flex-col gap-0.5 type-body-sm">
      <span className="text-ink">
        {t('item', {
          item: first.name,
          quantity: formatQuantity(first.quantity),
          unit: first.unit,
        })}
      </span>
      {rest.length > 0 && (
        <span className="text-ink-faint">{t('moreItems', { count: rest.length })}</span>
      )}
    </span>
  );
}

function NeedCell({ request }: { readonly request: PurchaseRequest }) {
  const format = useFormatter();
  const waiting = request.status === 'pending' || request.status === 'approved';
  if (!request.neededBy) return null;
  const late = waiting && request.neededBy < todayIn();
  return (
    <span className={late ? 'whitespace-nowrap text-overdue' : 'whitespace-nowrap text-ink'}>
      {format.dateTime(asDate(request.neededBy), SHORT)}
    </span>
  );
}

function OutcomeCell({ request }: { readonly request: PurchaseRequest }) {
  const t = useTranslations('purchasing.requests');
  if (request.purchaseOrder) {
    return (
      <Link
        href={`/inventory?tab=orders&order=${request.purchaseOrder.id}`}
        className="relative z-10 font-mono type-body-sm text-accent hover:underline"
      >
        {request.purchaseOrder.number}
      </Link>
    );
  }
  if (!request.decidedBy)
    return <span className="type-body-sm text-ink-faint">{t('waiting')}</span>;
  return (
    <span className="flex flex-col gap-0.5 type-body-sm">
      <span className="text-ink">{request.decidedBy.fullName}</span>
      {request.decisionNote && (
        <span className="line-clamp-2 text-ink-faint md:max-w-[16rem]">{request.decisionNote}</span>
      )}
    </span>
  );
}

/** Requests with what they are for, when it is needed and what procurement decided. */
export function RequestsTable({
  rows,
  onOpen,
}: {
  readonly rows: readonly PurchaseRequest[];
  readonly onOpen: (id: string) => void;
}) {
  const t = useTranslations('purchasing.requests');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const columns: readonly TableColumn<PurchaseRequest>[] = [
    {
      key: 'request',
      header: t('columns.request'),
      primary: true,
      cell: (request) => <RequestCell request={request} onOpen={onOpen} />,
    },
    {
      key: 'for',
      header: t('columns.for'),
      cell: (request) =>
        request.project ? (
          <Link
            href={`/projects/${request.project.id}`}
            className="relative z-10 whitespace-nowrap font-mono text-[0.8125rem] text-ink-muted hover:text-accent"
          >
            {request.project.code}
          </Link>
        ) : (
          <span className="text-ink-muted">{t('forStock')}</span>
        ),
    },
    {
      key: 'items',
      header: t('columns.items'),
      cell: (request) => <ItemsCell request={request} />,
    },
    { key: 'need', header: t('columns.need'), cell: (request) => <NeedCell request={request} /> },
    {
      key: 'raised',
      header: t('columns.raised'),
      hideOnPhone: true,
      cell: (request) => (
        <span className="flex flex-col gap-0.5 type-body-sm">
          <span className="whitespace-nowrap text-ink">{request.requestedBy.fullName}</span>
          <span className="whitespace-nowrap text-ink-faint">
            {format.relativeTime(new Date(request.requestedAt), now)}
          </span>
        </span>
      ),
    },
    {
      key: 'outcome',
      header: t('columns.outcome'),
      hideOnPhone: true,
      cell: (request) => <OutcomeCell request={request} />,
    },
  ];
  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={rows}
      rowKey={(request) => request.id}
    />
  );
}
