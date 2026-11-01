'use client';

import type { AmcPlan } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { CalendarHeart, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { AmcPlanDialog } from './amc-plan-dialog';
import { useAmcPlans } from './use-after-sales-settings';

/** Settings → AMC plans: what the service team can sell, with price, visits and length. */
export function AmcPlansPanel() {
  const t = useTranslations('afterSales.amc');
  const plans = useAmcPlans();
  const [editing, setEditing] = useState<AmcPlan | null>(null);
  const [adding, setAdding] = useState(false);

  const columns: readonly TableColumn<AmcPlan>[] = [
    {
      key: 'plan',
      header: t('columns.plan'),
      primary: true,
      cell: (plan) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setEditing(plan)}
            className="oh-stretched-link text-left type-body font-medium text-ink hover:text-accent"
          >
            {plan.name}
          </button>
          {plan.includes.length > 0 && (
            <span className="line-clamp-2 type-body-sm text-ink-faint md:max-w-[24rem]">
              {plan.includes.join(' · ')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'price',
      header: t('columns.price'),
      align: 'end',
      cell: (plan) => (
        <span className="whitespace-nowrap font-mono tabular-nums">
          {formatInr(plan.pricePaise)}
        </span>
      ),
    },
    {
      key: 'visits',
      header: t('columns.visits'),
      align: 'end',
      cell: (plan) => (
        <span className="whitespace-nowrap tabular-nums">
          {t('perYear', { count: plan.visitsPerYear })}
        </span>
      ),
    },
    {
      key: 'length',
      header: t('columns.length'),
      align: 'end',
      cell: (plan) => (
        <span className="whitespace-nowrap tabular-nums">
          {t('months', { count: plan.durationMonths })}
        </span>
      ),
    },
    {
      key: 'sold',
      header: t('columns.sold'),
      align: 'end',
      cell: (plan) => (
        <span className="whitespace-nowrap tabular-nums">
          {t('running', { count: plan.activeContracts })}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (plan) => (
        <StatusPill
          size="sm"
          tone={plan.active ? 'onTrack' : 'neutral'}
          label={plan.active ? t('active') : t('archived')}
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
      {plans.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {plans.isError && <LoadError error={plans.error} onRetry={() => plans.refetch()} />}
      {plans.data?.length === 0 && (
        <EmptyState icon={<CalendarHeart />} title={t('empty')} description={t('emptyBody')} />
      )}
      {plans.data && plans.data.length > 0 && (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={plans.data}
          rowKey={(plan) => plan.id}
        />
      )}
      <AmcPlanDialog
        open={adding || editing !== null}
        plan={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </section>
  );
}
