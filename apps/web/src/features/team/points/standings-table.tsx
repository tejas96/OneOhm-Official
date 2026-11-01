'use client';

import type { PointsStanding } from '@oneohm/api-contracts';
import { EmptyState, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { Award } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PersonChip } from '../person-chip';

const Amount = ({ value, strong }: { readonly value: number; readonly strong?: boolean }) => (
  <span
    className={
      strong
        ? 'font-mono text-[0.9375rem] text-ink tabular-nums'
        : 'font-mono text-[0.875rem] text-ink-muted tabular-nums'
    }
  >
    {value.toLocaleString('en-IN')}
  </span>
);

/** Approved points per person: this month first, then all time. */
export function StandingsTable({ standings }: { readonly standings: readonly PointsStanding[] }) {
  const t = useTranslations('team.points.standings');
  const columns: readonly TableColumn<PointsStanding>[] = [
    {
      key: 'person',
      header: t('columns.person'),
      primary: true,
      cell: (row) => <PersonChip person={row.user} />,
    },
    {
      key: 'month',
      header: t('columns.month'),
      align: 'end',
      cell: (row) => <Amount value={row.thisMonth} strong />,
    },
    {
      key: 'total',
      header: t('columns.total'),
      align: 'end',
      cell: (row) => <Amount value={row.total} />,
    },
  ];
  const rows = [...standings].sort(
    (a, b) =>
      b.thisMonth - a.thisMonth ||
      b.total - a.total ||
      a.user.fullName.localeCompare(b.user.fullName),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="type-title-lg text-ink">{t('title')}</h2>
        <p className="type-body-sm text-ink-faint">{t('description')}</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Award />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.user.id}
        />
      )}
    </section>
  );
}
