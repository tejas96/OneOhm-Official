'use client';

import type { WorkOrderSummary } from '@oneohm/api-contracts';
import {
  EmptyState,
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

export const WORK_ORDER_TONE: Readonly<Record<WorkOrderSummary['status'], PillTone>> = {
  open: 'neutral',
  in_progress: 'onTrack',
  completed: 'done',
  cancelled: 'blocked',
};

/** Work orders as rows: number, project, progress, due date and what it pays. */
export function WorkOrdersTable({
  orders,
  showContractor = false,
}: {
  readonly orders: readonly WorkOrderSummary[];
  readonly showContractor?: boolean;
}) {
  const t = useTranslations('contractors.workOrders');
  const format = useFormatter();
  if (orders.length === 0)
    return (
      <EmptyState icon={<ClipboardList />} title={t('emptyTitle')} description={t('emptyBody')} />
    );

  const columns: TableColumn<WorkOrderSummary>[] = [
    {
      key: 'order',
      header: t('columns.order'),
      primary: true,
      cell: (order) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/contractors/work-orders/${order.id}`}
            className="font-mono text-[0.8125rem] text-ink hover:text-accent"
          >
            {order.number}
          </Link>
          <span className="truncate type-body-sm text-ink-muted">
            {showContractor
              ? order.contractor.name
              : `${order.project.code} · ${order.project.name}`}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (order) => (
        <StatusPill
          size="sm"
          tone={order.overdue ? 'overdue' : WORK_ORDER_TONE[order.status]}
          label={order.overdue ? t('overdue') : t(`status.${order.status}`)}
        />
      ),
    },
    {
      key: 'progress',
      header: t('columns.progress'),
      cell: (order) => (
        <span className="type-body-sm whitespace-nowrap text-ink-muted tabular-nums">
          {t('tasksDone', { done: order.tasksDone, total: order.taskCount })}
        </span>
      ),
    },
    {
      key: 'due',
      header: t('columns.due'),
      hideOnPhone: true,
      cell: (order) =>
        order.dueDate ? (
          <time dateTime={order.dueDate} className="type-body-sm whitespace-nowrap text-ink">
            {format.dateTime(new Date(order.dueDate), { day: 'numeric', month: 'short' })}
          </time>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (order) => (
        <span className="type-body-sm text-ink tabular-nums">
          {formatInr(order.status === 'completed' ? order.netPayablePaise : order.grossPaise)}
        </span>
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('title')}
      columns={columns}
      rows={orders}
      rowKey={(order) => order.id}
    />
  );
}
