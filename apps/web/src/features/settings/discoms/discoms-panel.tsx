'use client';

import type { Discom } from '@oneohm/api-contracts';
import { Button, ResponsiveTable, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useDiscoms } from '../use-settings';
import { DiscomDialog } from './discom-dialog';
import { DiscomSetup } from './setup/discom-setup';
import { SubsidyRules } from './subsidy-rules';

/** DISCOM master data and the subsidy rules the price engine applies. */
export function DiscomsPanel() {
  const t = useTranslations('settings.discoms');
  const productsT = useTranslations('settings.products');
  const discoms = useDiscoms();
  const [editing, setEditing] = useState<Discom | null>(null);
  const [adding, setAdding] = useState(false);

  const columns: readonly TableColumn<Discom>[] = [
    {
      key: 'discom',
      header: t('columns.discom'),
      primary: true,
      cell: (discom) => (
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={() => setEditing(discom)}
            className="oh-stretched-link text-left font-mono type-body font-medium text-ink hover:text-accent"
          >
            {discom.code}
          </button>
          <span className="truncate type-body-sm text-ink-faint">{discom.name}</span>
        </span>
      ),
    },
    { key: 'state', header: t('columns.state'), cell: (discom) => discom.state },
    {
      key: 'expectedDays',
      header: t('columns.expectedDays'),
      align: 'end',
      cell: (discom) => (
        <span className="tabular-nums">{t('days', { count: discom.expectedDays })}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (discom) => (
        <StatusPill
          tone={discom.active ? 'onTrack' : 'neutral'}
          label={discom.active ? productsT('active') : productsT('archived')}
          size="sm"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-12">
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
        {discoms.isPending && <ListSkeleton label={t('loading')} rows={4} />}
        {discoms.isError && <LoadError error={discoms.error} onRetry={() => discoms.refetch()} />}
        {discoms.data && (
          <ResponsiveTable
            caption={t('title')}
            columns={columns}
            rows={discoms.data}
            rowKey={(discom) => discom.id}
          />
        )}
      </section>
      <DiscomSetup />
      <SubsidyRules />
      <DiscomDialog
        open={adding || editing !== null}
        discom={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
