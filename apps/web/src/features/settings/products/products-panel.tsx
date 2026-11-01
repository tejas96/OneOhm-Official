'use client';

import type { Product } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  EmptyState,
  ResponsiveTable,
  Select,
  StatusPill,
  Switch,
  type TableColumn,
} from '@oneohm/design-system/web';
import { LINE_CATEGORIES, type LineCategory } from '@oneohm/domain';
import { formatInr, formatWp } from '@oneohm/shared';
import { Package, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { StarterNotice } from '../starter-notice';
import { useAllProducts } from '../use-settings';
import { ProductDialog } from './product-dialog';

/** The seed marks its placeholder products with this brand. */
const STARTER_BRAND = 'Starter catalog';
const ALL = 'all';

function rating(product: Product): string {
  if (product.wattageWp) return formatWp(product.wattageWp);
  if (!product.ratedW) return '—';
  return product.ratedW >= 1000
    ? `${(product.ratedW / 1000).toLocaleString('en-IN')} kW`
    : `${product.ratedW.toLocaleString('en-IN')} W`;
}

function margin(product: Product): string {
  if (product.pricePaise === 0) return '—';
  const share = (product.pricePaise - product.costPaise) / product.pricePaise;
  return `${(share * 100).toFixed(1)}%`;
}

/** Every product quotations can use, with prices, cost and margin. */
export function ProductsPanel() {
  const t = useTranslations('settings.products');
  const settingsT = useTranslations('settings.starter');
  const products = useAllProducts();
  const [category, setCategory] = useState<LineCategory | typeof ALL>(ALL);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);

  const all = products.data ?? [];
  const starterCount = all.filter(
    (product) => product.active && product.brand === STARTER_BRAND,
  ).length;
  const present = LINE_CATEGORIES.filter((value) =>
    all.some((product) => product.category === value),
  );
  const visible = all.filter(
    (product) =>
      (showArchived || product.active) && (category === ALL || product.category === category),
  );

  const columns: readonly TableColumn<Product>[] = [
    {
      key: 'product',
      header: t('columns.product'),
      primary: true,
      cell: (product) => (
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={() => setEditing(product)}
            className="oh-stretched-link truncate text-left type-body font-medium text-ink hover:text-accent"
          >
            {product.name}
          </button>
          <span className="truncate font-mono text-[0.75rem] text-ink-faint">
            {product.brand} · {product.sku}
          </span>
        </span>
      ),
    },
    {
      key: 'category',
      header: t('columns.category'),
      cell: (product) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {t(`categories.${product.category}`)}
          {product.category === 'panel' && (
            <Badge variant={product.dcr ? 'energy' : 'outline'}>
              {product.dcr ? t('dcr') : t('nonDcr')}
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'rating', header: t('columns.rating'), cell: rating, align: 'end' },
    {
      key: 'price',
      header: t('columns.price'),
      align: 'end',
      cell: (product) => <span className="tabular-nums">{formatInr(product.pricePaise)}</span>,
    },
    {
      key: 'cost',
      header: t('columns.cost'),
      align: 'end',
      hideOnPhone: true,
      cell: (product) => (
        <span className="text-ink-muted tabular-nums">{formatInr(product.costPaise)}</span>
      ),
    },
    {
      key: 'margin',
      header: t('columns.margin'),
      align: 'end',
      cell: (product) => <span className="font-mono text-ink-muted">{margin(product)}</span>,
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (product) => (
        <StatusPill
          tone={product.active ? 'onTrack' : 'neutral'}
          label={product.active ? t('active') : t('archived')}
          size="sm"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {starterCount > 0 && (
        <StarterNotice>{settingsT('products', { count: starterCount })}</StarterNotice>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        <Button variant="primary" leadingIcon={<Plus />} onClick={() => setAdding(true)}>
          {t('add')}
        </Button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={category}
          onValueChange={setCategory}
          options={[
            { value: ALL, label: t('all') },
            ...present.map((value) => ({ value, label: t(`categories.${value}`) })),
          ]}
          label={t('columns.category')}
          className="sm:w-56"
        />
        <Switch
          checked={showArchived}
          onCheckedChange={setShowArchived}
          label={t('showArchived')}
          className="sm:ml-auto"
        />
      </div>
      {products.isPending && <ListSkeleton label={t('loading')} />}
      {products.isError && <LoadError error={products.error} onRetry={() => products.refetch()} />}
      {products.data && visible.length === 0 && (
        <EmptyState icon={<Package />} title={t('emptyTitle')} description={t('emptyBody')} />
      )}
      {visible.length > 0 && (
        <ResponsiveTable
          caption={t('intro')}
          columns={columns}
          rows={visible}
          rowKey={(product) => product.id}
        />
      )}
      <ProductDialog
        open={adding || editing !== null}
        product={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
