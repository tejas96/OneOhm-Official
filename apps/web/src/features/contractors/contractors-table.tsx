'use client';

import type { ContractorSummary } from '@oneohm/api-contracts';
import { Badge, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { formatPhone } from '@/lib/format/contact';

/** Every contractor as one row: contact, open work, on-time share, rework and money owed. */
export function ContractorsTable({ rows }: { readonly rows: readonly ContractorSummary[] }) {
  const t = useTranslations('contractors');
  const columns: readonly TableColumn<ContractorSummary>[] = [
    {
      key: 'name',
      header: t('columns.name'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <Link
            href={`/contractors/${row.id}`}
            className="oh-stretched-link type-body font-medium text-ink hover:text-accent"
          >
            {row.name}
          </Link>
          <span className="type-body-sm text-ink-faint">
            {t('crewCount', { count: row.memberCount })}
            {!row.active && <Badge className="ml-2">{t('archived')}</Badge>}
          </span>
        </span>
      ),
    },
    {
      key: 'contact',
      header: t('columns.contact'),
      cell: (row) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink">{row.contactName ?? '—'}</span>
          {row.phone && <span className="font-mono text-ink-faint">{formatPhone(row.phone)}</span>}
        </span>
      ),
    },
    {
      key: 'areas',
      header: t('columns.areas'),
      cell: (row) => (
        <span className="type-body-sm text-ink-muted">{row.serviceAreas.join(' · ') || '—'}</span>
      ),
    },
    {
      key: 'open',
      header: t('figures.openWork'),
      align: 'end',
      cell: (row) => <span className="tabular-nums">{row.performance.openWorkOrders}</span>,
    },
    {
      key: 'onTime',
      header: t('columns.onTime'),
      align: 'end',
      cell: (row) => (
        <span className="tabular-nums">
          {row.performance.onTimePercent === null ? '—' : `${row.performance.onTimePercent}%`}
        </span>
      ),
    },
    {
      key: 'rating',
      header: t('figures.rating'),
      align: 'end',
      cell: (row) =>
        row.performance.rating ? (
          <span className="tabular-nums">
            {t('figures.ratingValue', { value: row.performance.rating })}
          </span>
        ) : (
          <span
            className="text-ink-faint"
            title={t('figures.ratingTooFew', { count: row.performance.ratings ?? 0 })}
          >
            —
          </span>
        ),
    },
    {
      key: 'rework',
      header: t('figures.rework'),
      align: 'end',
      cell: (row) => (
        <span
          className={row.performance.reworkCount > 0 ? 'text-at-risk tabular-nums' : 'tabular-nums'}
        >
          {row.performance.reworkCount}
        </span>
      ),
    },
    {
      key: 'owed',
      header: t('figures.pending'),
      align: 'end',
      cell: (row) => (
        <span className="font-mono tabular-nums">
          {formatInr(row.performance.pendingPayablePaise)}
        </span>
      ),
    },
  ];
  return (
    <ResponsiveTable caption={t('title')} columns={columns} rows={rows} rowKey={(row) => row.id} />
  );
}
