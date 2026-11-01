'use client';

import type { CollectionsReport } from '@oneohm/api-contracts';
import { ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { NUM, SplitBar } from '../parts/report-body';
import { money } from '../parts/report-format';
import { Figure, TABLE, TableCard } from './collections-parts';

type ProjectRow = CollectionsReport['byProject'][number];

/** Live projects with money left to collect: paid so far, owed now and how late. */
export function OwedByProject({ rows }: { readonly rows: readonly ProjectRow[] }) {
  const t = useTranslations('collectionsReport.projects');
  const columns: TableColumn<ProjectRow>[] = [
    {
      key: 'project',
      header: t('project'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <Link
            href={`/projects/${row.projectId}`}
            className="oh-stretched-link font-mono text-[0.875rem] text-ink hover:text-accent"
          >
            {row.code}
          </Link>
          <span className="truncate type-body-sm text-ink-faint">{row.customerName}</span>
        </span>
      ),
    },
    {
      key: 'contract',
      header: t('contract'),
      align: 'end',
      hideOnPhone: true,
      cell: (row) => <Figure value={money(row.contractPaise)} />,
    },
    {
      key: 'paid',
      header: t('paid'),
      cell: (row) => (
        <span className="flex min-w-28 flex-col items-end gap-1 md:items-stretch">
          <span className={`${NUM} text-right text-ink`}>{money(row.paidPaise)}</span>
          <SplitBar
            className="hidden md:flex"
            total={row.contractPaise}
            parts={[{ key: 'paid', value: row.paidPaise, fill: 'bg-on-track-solid' }]}
          />
        </span>
      ),
    },
    {
      key: 'owed',
      header: t('owed'),
      align: 'end',
      cell: (row) => (
        <Figure
          value={
            <span className={row.overduePaise > 0 ? 'font-medium text-overdue' : undefined}>
              {money(row.owedPaise)}
            </span>
          }
          detail={
            row.notDueYetPaise > 0 ? t('later', { amount: money(row.notDueYetPaise) }) : undefined
          }
        />
      ),
    },
    {
      key: 'oldest',
      header: t('oldest'),
      align: 'end',
      cell: (row) =>
        row.oldestOverdueDays === null ? (
          <span className="whitespace-nowrap type-body-sm text-ink-faint">{t('notOverdue')}</span>
        ) : (
          <span className={`${NUM} whitespace-nowrap font-medium text-overdue`}>
            {t('days', { days: row.oldestOverdueDays })}
          </span>
        ),
    },
  ];
  return (
    <TableCard title={t('title')} body={t('body')} empty={rows.length === 0 ? t('none') : null}>
      <ResponsiveTable
        caption={t('title')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.projectId}
        className={TABLE}
      />
    </TableCard>
  );
}
