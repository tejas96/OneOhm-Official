'use client';

import type { ContractorDetail } from '@oneohm/api-contracts';
import { Badge, Button, pageEnter, Skeleton, SkeletonGroup } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { ArrowLeft, ClipboardList, Landmark, PencilLine } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadError } from '@/components/query-state';
import { formatPhone } from '@/lib/format/contact';
import { ContractorCrewCard } from './contractor-crew-card';
import { ContractorEditSheet } from './contractor-edit-sheet';
import { ContractorMaterialCard } from './contractor-material-card';
import { ContractorRatesCard } from './contractor-rates-card';
import { IssueWorkOrderDialog } from './issue-work-order-dialog';
import { useContractor } from './use-contractors';
import { WorkOrdersTable } from './work-orders-table';

/** One contractor: who they are, how they perform, their crew, rates and work orders. */
export function ContractorDetailView({ id }: { readonly id: string }) {
  const t = useTranslations('contractors');
  const query = useContractor(id);
  const [editing, setEditing] = useState(false);
  const [issuing, setIssuing] = useState(false);

  if (query.isPending)
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6"
      >
        <Skeleton className="h-32 w-2/3 rounded-2xl" />
        <Skeleton className="h-64 rounded-[28px]" />
      </SkeletonGroup>
    );
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const contractor = query.data;

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <Link
        href="/contractors"
        className="inline-flex w-fit items-center gap-1.5 type-body-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 font-mono text-[0.75rem] text-ink-faint uppercase">
            {t(`form.kinds.${contractor.kind}`)}
            {contractor.gstin && <span>· GSTIN {contractor.gstin}</span>}
            {!contractor.active && <Badge>{t('archived')}</Badge>}
          </p>
          <h1 className="type-display-lg text-balance text-ink">{contractor.name}</h1>
          <p className="type-body text-ink-muted">
            {[
              contractor.contactName,
              contractor.phone && formatPhone(contractor.phone),
              contractor.serviceAreas.join(', '),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leadingIcon={<PencilLine />} onClick={() => setEditing(true)}>
            {t('edit')}
          </Button>
          <Button
            variant="primary"
            leadingIcon={<ClipboardList />}
            onClick={() => setIssuing(true)}
            disabled={!contractor.active}
          >
            {t('issue.open')}
          </Button>
        </div>
      </header>
      <PerformanceStrip contractor={contractor} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-10 lg:col-span-7">
          <section className="flex flex-col gap-4">
            <h2 className="type-title-lg text-ink [font-family:var(--font-display)]">
              {t('workOrders.title')}
            </h2>
            <WorkOrdersTable orders={contractor.workOrders} />
          </section>
          <ContractorMaterialCard contractorId={contractor.id} />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-5">
          <ContractorCrewCard contractor={contractor} />
          <ContractorRatesCard contractor={contractor} />
          <TermsCard contractor={contractor} />
        </div>
      </div>
      <ContractorEditSheet contractor={contractor} open={editing} onOpenChange={setEditing} />
      <IssueWorkOrderDialog contractor={contractor} open={issuing} onOpenChange={setIssuing} />
    </motion.div>
  );
}

function PerformanceStrip({ contractor }: { readonly contractor: ContractorDetail }) {
  const t = useTranslations('contractors.figures');
  const p = contractor.performance;
  const ratings = p.ratings ?? 0;
  const items: { key: string; value: string; note?: string }[] = [
    { key: 'onTime', value: p.onTimePercent === null ? '—' : `${p.onTimePercent}%` },
    {
      key: 'rating',
      value: p.rating ? t('ratingValue', { value: p.rating }) : '—',
      note: p.rating ? t('ratingCount', { count: ratings }) : t('ratingTooFew', { count: ratings }),
    },
    { key: 'openWork', value: String(p.openWorkOrders) },
    { key: 'overdueTasks', value: `${p.overdueTasks} / ${p.openTasks}` },
    { key: 'rework', value: String(p.reworkCount) },
    { key: 'pending', value: formatInrCompact(p.pendingPayablePaise) },
    { key: 'paid', value: formatInrCompact(p.paidPaise) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-hairline py-6 sm:grid-cols-4 xl:grid-cols-7">
      {items.map((item) => (
        <div key={item.key} className="flex flex-col gap-1">
          <dt className="type-overline text-ink-faint uppercase">{t(item.key)}</dt>
          <dd className="type-display-md text-ink tabular-nums">{item.value}</dd>
          {item.note && <dd className="type-label text-ink-faint">{item.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

function TermsCard({ contractor }: { readonly contractor: ContractorDetail }) {
  const t = useTranslations('contractors.terms');
  const percent = (bp: number) => `${bp / 100}%`;
  const rows = [
    [t('payment'), t('days', { count: contractor.paymentTermsDays })],
    [t('tds'), percent(contractor.tdsBp)],
    [
      t('retention'),
      `${percent(contractor.retentionBp)} · ${t('days', { count: contractor.retentionDays })}`,
    ],
    [
      t('bank'),
      contractor.bankAccountNumber
        ? `${contractor.bankAccountName ?? ''} ••${contractor.bankAccountNumber.slice(-4)} · ${contractor.bankIfsc ?? ''}`
        : t('noBank'),
    ],
  ] as const;
  return (
    <section className="flex flex-col gap-3 rounded-[28px] bg-raised p-6 shadow-e1 ring-1 ring-hairline/70">
      <h2 className="flex items-center gap-2 type-title-md text-ink">
        <Landmark aria-hidden className="size-4 text-ink-faint" />
        {t('title')}
      </h2>
      <dl className="flex flex-col">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-3 py-2">
            <dt className="type-body-sm text-ink-muted">{label}</dt>
            <span aria-hidden className="flex-1 border-b border-dotted border-rule" />
            <dd className="type-body-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
