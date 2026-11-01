'use client';

import { pageEnter, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { formatInrCompact, formatKwp } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { CustomerHeader } from './customer-header';
import { CustomerTabs } from './customer-tabs';

/**
 * The customer 360 (PRD 3.2): who they are on top, then their sites and projects, money,
 * conversations, service and documents in tabs (`?tab=`).
 */
export function CustomerDetailView({ id }: { readonly id: string }) {
  const t = useTranslations('customers');
  const query = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => expectStatus(api.crm.getCustomer({ params: { id } }), 200),
  });

  if (query.isPending) {
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6"
      >
        <Skeleton className="h-28 w-1/2 rounded-2xl" />
        <Skeleton className="h-64 rounded-[28px]" />
      </SkeletonGroup>
    );
  }
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const customer = query.data;
  const accepted = customer.quotations.filter((quotation) => quotation.status === 'accepted');
  const installedWp = customer.projects.reduce((sum, project) => sum + project.capacityWp, 0);

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-10">
      <CustomerHeader customer={customer} accounts={customer.accounts}>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-4 border-y border-hairline py-5 sm:grid-cols-4">
          <Figure label={t('figures.sites')} value={String(customer.properties.length)} />
          <Figure label={t('figures.quotations')} value={String(customer.quotations.length)} />
          <Figure
            label={t('figures.accepted')}
            value={
              accepted.length
                ? formatInrCompact(accepted.reduce((sum, row) => sum + row.totalPaise, 0))
                : '—'
            }
          />
          <Figure
            label={t('figures.capacity')}
            value={installedWp ? formatKwp(installedWp) : '—'}
          />
        </dl>
      </CustomerHeader>
      <CustomerTabs customer={customer} />
    </motion.div>
  );
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="type-label text-ink-faint">{label}</dt>
      <dd className="type-display-md text-ink tabular-nums">{value}</dd>
    </div>
  );
}
