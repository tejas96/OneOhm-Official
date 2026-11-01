'use client';

import {
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderStatus,
  type PurchaseOrderSummary,
} from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  ResponsiveTable,
  SegmentedControl,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ClipboardList, Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { useOrders } from '../use-inventory';
import { OrderFormSheet } from './order-form-sheet';
import { OrderSheet } from './order-sheet';
import { OrderStatusPill } from './order-status';

const ALL = 'all';
type Filter = PurchaseOrderStatus | typeof ALL;

/**
 * Every purchase order with its status and how much has arrived. `?order=` opens one;
 * `?new=1&projectId=` (from a project's material card) opens a new order for that project.
 */
export function OrdersPanel() {
  const t = useTranslations('inventory.orders');
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const canBuy = useCan('procurement.manage');
  const [filter, setFilter] = useState<Filter>(ALL);
  const orders = useOrders(filter === ALL ? undefined : filter);
  const openId = params.get('order');
  const creating = params.get('new') === '1';

  const navigate = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    change(next);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const open = (id: string | null) =>
    navigate((next) => {
      next.delete('new');
      next.delete('projectId');
      if (id) next.set('order', id);
      else next.delete('order');
    });

  const columns: readonly TableColumn<PurchaseOrderSummary>[] = [
    {
      key: 'number',
      header: t('columns.number'),
      primary: true,
      cell: (order) => (
        <span className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => open(order.id)}
            className="oh-stretched-link text-left font-mono type-body-sm font-medium text-ink hover:text-accent"
          >
            {order.number}
          </button>
          <OrderStatusPill status={order.status} />
        </span>
      ),
    },
    {
      key: 'vendor',
      header: t('columns.vendor'),
      cell: (order) => <span className="text-ink">{order.vendorName}</span>,
    },
    {
      key: 'project',
      header: t('columns.project'),
      cell: (order) => (
        <span className="font-mono text-[0.8125rem] text-ink-muted">
          {order.projectCode ?? t('forStock')}
        </span>
      ),
    },
    {
      key: 'date',
      header: t('columns.date'),
      hideOnPhone: true,
      cell: (order) => (
        <span className="text-ink-muted">
          {format.dateTime(new Date(order.orderDate), { day: 'numeric', month: 'short' })}
        </span>
      ),
    },
    {
      key: 'received',
      header: t('columns.received'),
      hideOnPhone: true,
      cell: (order) => (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-sunken">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.round(order.receivedShare * 100)}%` }}
            />
          </span>
          <span className="font-mono text-[0.75rem] text-ink-faint">
            {Math.round(order.receivedShare * 100)}%
          </span>
        </span>
      ),
    },
    {
      key: 'total',
      header: t('columns.total'),
      align: 'end',
      cell: (order) => <span className="tabular-nums">{formatInr(order.totalPaise)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          size="sm"
          label={t('caption')}
          options={[
            { value: ALL, label: t('all') },
            ...PURCHASE_ORDER_STATUSES.filter((status) => status !== 'closed').map((status) => ({
              value: status,
              label: t(`statuses.${status}`),
            })),
          ]}
          className="max-w-full overflow-x-auto [&_*]:whitespace-nowrap"
        />
        {canBuy && (
          <Button
            variant="primary"
            leadingIcon={<Plus />}
            onClick={() => navigate((next) => next.set('new', '1'))}
          >
            {t('new')}
          </Button>
        )}
      </div>
      {orders.isPending && <ListSkeleton label={t('loading')} />}
      {orders.isError && <LoadError error={orders.error} onRetry={() => orders.refetch()} />}
      {orders.data?.length === 0 && (
        <EmptyState icon={<ClipboardList />} title={t('emptyTitle')} description={t('emptyBody')} />
      )}
      {orders.data && orders.data.length > 0 && (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={orders.data}
          rowKey={(order) => order.id}
        />
      )}
      <OrderSheet orderId={openId} onClose={() => open(null)} />
      <OrderFormSheet
        open={creating && canBuy}
        projectId={params.get('projectId')}
        onClose={() =>
          navigate((next) => {
            next.delete('new');
            next.delete('projectId');
          })
        }
        onCreated={open}
      />
    </div>
  );
}
