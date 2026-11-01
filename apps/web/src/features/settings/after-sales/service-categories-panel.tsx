'use client';

import type { ServiceCategory } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { CategoryDialog } from './category-dialog';
import { useCategories, useHours } from './use-after-sales-settings';

/** Settings → Service and SLAs: each kind of request with its promised times (PRD 7.2). */
export function ServiceCategoriesPanel() {
  const t = useTranslations('afterSales.categories');
  const hours = useHours();
  const categories = useCategories();
  const [editing, setEditing] = useState<ServiceCategory | null>(null);
  const [adding, setAdding] = useState(false);

  const columns: readonly TableColumn<ServiceCategory>[] = [
    {
      key: 'category',
      header: t('columns.category'),
      primary: true,
      cell: (category) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => setEditing(category)}
            className="oh-stretched-link text-left type-body font-medium text-ink hover:text-accent"
          >
            {category.label}
          </button>
          {category.system && <Badge variant="soft">{t('system')}</Badge>}
        </span>
      ),
    },
    {
      key: 'customer',
      header: t('columns.customer'),
      cell: (category) =>
        category.system ? (
          <span className="type-body-sm text-ink-faint">—</span>
        ) : (
          <span className="type-body-sm text-ink-muted">{category.customerLabel}</span>
        ),
    },
    {
      key: 'response',
      header: t('columns.response'),
      align: 'end',
      cell: (category) => (
        <span className="whitespace-nowrap tabular-nums">{hours(category.responseHours)}</span>
      ),
    },
    {
      key: 'resolution',
      header: t('columns.resolution'),
      align: 'end',
      cell: (category) => (
        <span className="whitespace-nowrap tabular-nums">{hours(category.resolutionHours)}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (category) => (
        <StatusPill
          size="sm"
          tone={category.active ? 'onTrack' : 'neutral'}
          label={category.active ? t('active') : t('archived')}
        />
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="type-display-md text-ink">{t('title')}</h2>
          <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        </div>
        <Button variant="secondary" leadingIcon={<Plus />} onClick={() => setAdding(true)}>
          {t('add')}
        </Button>
      </div>
      {categories.isPending && <ListSkeleton label={t('loading')} rows={6} />}
      {categories.isError && (
        <LoadError error={categories.error} onRetry={() => categories.refetch()} />
      )}
      {categories.data && (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={categories.data}
          rowKey={(category) => category.id}
        />
      )}
      <p className="max-w-2xl type-body-sm text-ink-faint">{t('visitNote')}</p>
      <CategoryDialog
        open={adding || editing !== null}
        category={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </section>
  );
}
