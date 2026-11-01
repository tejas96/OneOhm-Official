'use client';

import type { VendorProfile } from '@oneohm/api-contracts';
import {
  EmptyState,
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ClipboardList, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { OrderStatusPill } from '../../inventory/orders/order-status';
import { formatQuantity } from '../../inventory/use-inventory';

type Order = VendorProfile['orders'][number];
type Rejection = VendorProfile['rejections'][number];

const OUTCOME_TONE: Readonly<Record<Order['outcome'], PillTone>> = {
  on_time: 'onTrack',
  late: 'overdue',
  open_late: 'atRisk',
  open: 'waiting',
  no_date: 'neutral',
  not_ordered: 'neutral',
};

function useDay() {
  const format = useFormatter();
  return (value: string | null) =>
    value
      ? format.dateTime(new Date(`${value}T12:00:00`), {
          day: 'numeric',
          month: 'short',
          year: '2-digit',
        })
      : '—';
}

/** Every order with when it was promised, when it came and whether that was on time. */
export function VendorOrdersTable({ orders }: { readonly orders: readonly Order[] }) {
  const t = useTranslations('purchasing.profile.orders');
  const day = useDay();
  if (orders.length === 0) {
    return (
      <EmptyState icon={<ClipboardList />} title={t('emptyTitle')} description={t('emptyBody')} />
    );
  }
  const columns: readonly TableColumn<Order>[] = [
    {
      key: 'order',
      header: t('columns.order'),
      primary: true,
      cell: (order) => (
        <span className="flex flex-col items-start gap-1">
          <Link
            href={`/inventory?tab=orders&order=${order.id}`}
            className="oh-stretched-link font-mono type-body-sm font-medium text-ink hover:text-accent"
          >
            {order.number}
          </Link>
          <OrderStatusPill status={order.status} />
        </span>
      ),
    },
    {
      key: 'for',
      header: t('columns.for'),
      cell: (order) => (
        <span className="font-mono text-[0.8125rem] text-ink-muted">
          {order.projectCode ?? t('forStock')}
        </span>
      ),
    },
    {
      key: 'ordered',
      header: t('columns.ordered'),
      hideOnPhone: true,
      cell: (order) => (
        <span className="whitespace-nowrap text-ink-muted">{day(order.orderDate)}</span>
      ),
    },
    {
      key: 'expected',
      header: t('columns.expected'),
      cell: (order) => <span className="whitespace-nowrap text-ink">{day(order.expectedOn)}</span>,
    },
    {
      key: 'received',
      header: t('columns.received'),
      hideOnPhone: true,
      cell: (order) => (
        <span className="whitespace-nowrap text-ink">{day(order.lastReceivedOn)}</span>
      ),
    },
    {
      key: 'outcome',
      header: t('columns.outcome'),
      cell: (order) => (
        <StatusPill
          size="sm"
          tone={OUTCOME_TONE[order.outcome]}
          label={t(`outcomes.${order.outcome}`)}
        />
      ),
    },
    {
      key: 'total',
      header: t('columns.total'),
      align: 'end',
      cell: (order) => (
        <span className="font-mono tabular-nums">{formatInr(order.totalPaise)}</span>
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={orders}
      rowKey={(order) => order.id}
    />
  );
}

/** Units that failed inspection at the gate, with the reason recorded. */
export function VendorRejectionsTable({
  rejections,
}: {
  readonly rejections: readonly Rejection[];
}) {
  const t = useTranslations('purchasing.profile.inspection');
  const day = useDay();
  if (rejections.length === 0) {
    return (
      <EmptyState icon={<ShieldCheck />} title={t('emptyTitle')} description={t('emptyBody')} />
    );
  }
  const columns: readonly TableColumn<Rejection>[] = [
    {
      key: 'receipt',
      header: t('columns.receipt'),
      primary: true,
      cell: (row) => (
        <span className="flex flex-col">
          <span className="font-mono type-body-sm font-medium text-ink">{row.receiptNumber}</span>
          <span className="type-label text-ink-faint">{day(row.receivedOn)}</span>
        </span>
      ),
    },
    {
      key: 'item',
      header: t('columns.item'),
      cell: (row) => <span className="text-ink">{row.description}</span>,
    },
    {
      key: 'quantity',
      header: t('columns.quantity'),
      align: 'end',
      cell: (row) => (
        <span className="whitespace-nowrap text-at-risk tabular-nums">
          {formatQuantity(row.rejectedQuantity)} {row.unit}
        </span>
      ),
    },
    {
      key: 'reason',
      header: t('columns.reason'),
      cell: (row) => <span className="type-body-sm text-ink-muted">{row.reason ?? '—'}</span>,
    },
  ];
  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={rejections}
      rowKey={(row) => `${row.receiptNumber}-${row.description}`}
    />
  );
}
