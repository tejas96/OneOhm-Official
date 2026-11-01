'use client';

import type { ProjectSummary, QuotationSummary } from '@oneohm/api-contracts';
import {
  Badge,
  cn,
  listItemEnter,
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInrCompact, formatKwp } from '@oneohm/shared';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { MetroLine, ProjectStatus } from '@/features/projects/project-journey';

const QUOTATION_TONE: Readonly<Record<QuotationSummary['status'], PillTone>> = {
  draft: 'neutral',
  sent: 'review',
  accepted: 'done',
  rejected: 'blocked',
  superseded: 'neutral',
};

/** Every quotation for the customer, newest revision first, each opening its detail. */
export function CustomerQuotations({
  quotations,
}: {
  readonly quotations: readonly QuotationSummary[];
}) {
  const t = useTranslations('customers.quotations');
  const format = useFormatter();
  if (quotations.length === 0) return <p className="type-body-sm text-ink-faint">{t('none')}</p>;
  const columns: TableColumn<QuotationSummary>[] = [
    {
      key: 'number',
      header: t('number'),
      primary: true,
      cell: (quotation) => (
        <span className="flex flex-col">
          <Link
            href={`/quotations/${quotation.id}`}
            className="oh-stretched-link font-mono text-[0.875rem] text-ink hover:text-accent"
          >
            {quotation.number}
            {quotation.revision > 1 && (
              <span className="text-ink-faint"> · R{quotation.revision}</span>
            )}
          </Link>
          <span className="truncate type-body-sm text-ink-faint">{quotation.propertyLabel}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      cell: (quotation) => (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5 md:justify-start">
          <StatusPill
            tone={QUOTATION_TONE[quotation.status]}
            label={t(`statuses.${quotation.status}`)}
            size="sm"
          />
          {quotation.discountPendingApproval && (
            <Badge variant="accent">{t('discountPending')}</Badge>
          )}
        </span>
      ),
    },
    {
      key: 'size',
      header: t('size'),
      align: 'end',
      cell: (quotation) => (
        <span className="font-mono text-[0.8125rem]">{formatKwp(quotation.capacityWp)}</span>
      ),
    },
    {
      key: 'total',
      header: t('total'),
      align: 'end',
      cell: (quotation) => (
        <span className="tabular-nums">{formatInrCompact(quotation.totalPaise)}</span>
      ),
    },
    {
      key: 'effective',
      header: t('effective'),
      align: 'end',
      cell: (quotation) => (
        <span className="font-medium tabular-nums">
          {formatInrCompact(quotation.effectivePaise)}
        </span>
      ),
    },
    {
      key: 'valid',
      header: t('validUntil'),
      hideOnPhone: true,
      align: 'end',
      cell: (quotation) => (
        <span className="type-body-sm text-ink-muted">
          {format.dateTime(new Date(quotation.validUntil), { day: 'numeric', month: 'short' })}
        </span>
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('title')}
      columns={columns}
      rows={quotations}
      rowKey={(row) => row.id}
    />
  );
}

/** The customer's projects as metro lines, the same picture the owner sees. */
export function CustomerProjects({ projects }: { readonly projects: readonly ProjectSummary[] }) {
  const t = useTranslations('customers.projects');
  if (projects.length === 0) return <p className="type-body-sm text-ink-faint">{t('none')}</p>;
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {projects.map((project, index) => (
        <motion.li
          key={project.id}
          {...listItemEnter(index)}
          className={cn(
            'relative grid gap-4 rounded-lg py-4 transition-colors hover:bg-surface/60',
            'md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1fr)] md:items-center',
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-mono text-[0.75rem] text-ink-faint">
              {project.code} · {formatKwp(project.capacityWp)}
            </p>
            <Link
              href={`/projects/${project.id}`}
              className="truncate type-title-md text-ink [font-family:var(--font-display)] after:absolute after:inset-0 hover:text-accent"
            >
              {project.name}
            </Link>
            <p className="truncate type-body-sm text-ink-faint">{project.place}</p>
          </div>
          <MetroLine project={project} index={index} />
          <ProjectStatus project={project} />
        </motion.li>
      ))}
    </ul>
  );
}
