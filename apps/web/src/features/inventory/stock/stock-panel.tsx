'use client';

import type { StockRow } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  EmptyState,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { Package, PackagePlus, Search, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { formatQuantity, useStock } from '../use-inventory';
import { AdjustDialog } from './adjust-dialog';
import { MovementsCard } from './movements-card';
import { filterStock } from './stock-filters';
import { StockToolbar, useStockFilters } from './stock-toolbar';
import { ThresholdDialog } from './threshold-dialog';

/** Every catalog product's stock across locations, with shortage alerts and the ledger. */
export function StockPanel() {
  const t = useTranslations('inventory.stock');
  const categoryT = useTranslations('inventory.categories');
  const stock = useStock();
  const canManage = useCan('inventory.manage');
  const [adjusting, setAdjusting] = useState<{ productId: string | null } | null>(null);
  const [threshold, setThreshold] = useState<StockRow | null>(null);
  const toolbar = useStockFilters();

  if (stock.isPending) return <ListSkeleton label={t('loading')} />;
  if (stock.isError) return <LoadError error={stock.error} onRetry={() => stock.refetch()} />;
  const rows = stock.data;
  if (rows.length === 0) {
    return <EmptyState icon={<Package />} title={t('emptyTitle')} description={t('emptyBody')} />;
  }
  const low = rows.filter((row) => row.low);
  const value = rows.reduce((sum, row) => sum + row.valuePaise, 0);
  const shown = filterStock(rows, toolbar.filters, (category) => categoryT(category));

  const quantity = (amount: number, unit: string, muted = false) => (
    <span className={muted ? 'text-ink-muted tabular-nums' : 'text-ink tabular-nums'}>
      {formatQuantity(amount)} <span className="text-ink-faint">{unit}</span>
    </span>
  );
  const columns: readonly TableColumn<StockRow>[] = [
    {
      key: 'product',
      header: t('columns.product'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate type-body font-medium text-ink">{row.name}</span>
            {row.low && <StatusPill tone="atRisk" label={t('low')} size="sm" />}
          </span>
          <span className="truncate font-mono text-[0.75rem] text-ink-faint">
            {categoryT(row.category)} · {row.brand} · {row.sku}
          </span>
        </span>
      ),
    },
    {
      key: 'onHand',
      header: t('columns.onHand'),
      align: 'end',
      cell: (row) => quantity(row.onHand, row.unit),
    },
    {
      key: 'reserved',
      header: t('columns.reserved'),
      align: 'end',
      cell: (row) => quantity(row.reserved, row.unit, true),
    },
    {
      key: 'available',
      header: t('columns.available'),
      align: 'end',
      cell: (row) => (
        <span className={row.low ? 'font-medium text-at-risk tabular-nums' : 'tabular-nums'}>
          {formatQuantity(row.available)}
        </span>
      ),
    },
    {
      key: 'minimum',
      header: t('columns.minimum'),
      align: 'end',
      hideOnPhone: true,
      cell: (row) =>
        canManage ? (
          <button
            type="button"
            onClick={() => setThreshold(row)}
            className="rounded-md px-2 py-1 font-mono text-ink-muted transition-colors hover:bg-sunken hover:text-accent"
          >
            {row.minimum === null ? t('setMinimum') : formatQuantity(row.minimum)}
          </button>
        ) : (
          <span className="font-mono text-ink-muted">
            {row.minimum === null ? t('noMinimum') : formatQuantity(row.minimum)}
          </span>
        ),
    },
    {
      key: 'value',
      header: t('columns.value'),
      align: 'end',
      hideOnPhone: true,
      cell: (row) => (
        <span className="text-ink-muted tabular-nums">{formatInrCompact(row.valuePaise)}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-6 border-y border-hairline py-5">
        <dl className="flex flex-wrap gap-x-12 gap-y-4">
          <Figure label={t('summary.value')} value={formatInrCompact(value)} />
          <Figure
            label={t('summary.items')}
            value={String(rows.filter((row) => row.onHand > 0).length)}
          />
          <Figure label={t('summary.low')} value={String(low.length)} alert={low.length > 0} />
        </dl>
        {canManage && (
          <Button
            variant="primary"
            leadingIcon={<PackagePlus />}
            onClick={() => setAdjusting({ productId: null })}
          >
            {t('adjust')}
          </Button>
        )}
      </div>
      {low.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl bg-at-risk-tint px-5 py-4 text-at-risk">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-2">
            <p className="type-body font-medium">{t('lowTitle', { count: low.length })}</p>
            <p className="type-body-sm text-ink-muted">{t('lowBody')}</p>
            <ul className="flex flex-wrap gap-2">
              {low.map((row) => (
                <li key={row.productId}>
                  <Badge variant="outline">
                    {row.name} · {formatQuantity(row.available)}/{formatQuantity(row.minimum ?? 0)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <StockToolbar {...toolbar} />
        {shown.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title={t('filters.noMatchTitle')}
            description={t('filters.noMatchBody')}
          />
        ) : (
          <ResponsiveTable
            caption={t('caption')}
            columns={columns}
            rows={shown}
            rowKey={(row) => row.productId}
          />
        )}
      </div>
      <MovementsCard products={rows} />
      <AdjustDialog
        open={adjusting !== null}
        productId={adjusting?.productId ?? null}
        rows={rows}
        onClose={() => setAdjusting(null)}
      />
      <ThresholdDialog row={threshold} onClose={() => setThreshold(null)} />
    </div>
  );
}

function Figure({
  label,
  value,
  alert = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly alert?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="type-overline text-ink-faint uppercase">{label}</dt>
      <dd
        className={
          alert
            ? 'type-display-md text-at-risk tabular-nums'
            : 'type-display-md text-ink tabular-nums'
        }
      >
        {value}
      </dd>
    </div>
  );
}
