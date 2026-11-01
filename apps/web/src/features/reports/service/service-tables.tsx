'use client';

import type { ServiceReport } from '@oneohm/api-contracts';
import { Card, CardHeader, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NUM } from '../parts/report-body';
import { decimal } from '../parts/report-format';

type CategoryRow = ServiceReport['byCategory'][number];
type AssigneeRow = ServiceReport['byAssignee'][number];

const humanise = (key: string) => {
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const number = (value: number, warn = false) => (
  <span className={`${NUM} ${warn && value > 0 ? 'text-at-risk' : 'text-ink'}`}>{value}</span>
);

export function ServiceByCategory({ rows }: { readonly rows: readonly CategoryRow[] }) {
  const t = useTranslations('serviceReport.tables');
  const categories = useTranslations('serviceReport.categories');
  const label = (key: string) => (categories.has(key) ? categories(key) : humanise(key));
  const columns: TableColumn<CategoryRow>[] = [
    {
      key: 'category',
      header: t('category'),
      primary: true,
      cell: (row) => <span className="font-medium text-ink">{label(row.category)}</span>,
    },
    { key: 'raised', header: t('raised'), align: 'end', cell: (row) => number(row.raised) },
    { key: 'resolved', header: t('resolved'), align: 'end', cell: (row) => number(row.resolved) },
    { key: 'open', header: t('open'), align: 'end', cell: (row) => number(row.openNow, true) },
    {
      key: 'hours',
      header: t('hours'),
      align: 'end',
      cell: (row) => (
        <span className={`${NUM} text-ink-muted`}>{decimal(row.averageResolutionHours)}</span>
      ),
    },
  ];
  return (
    <Card>
      <CardHeader title={t('byCategory')} description={t('byCategoryBody')} />
      <ResponsiveTable
        caption={t('byCategory')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.category}
        className="px-2 pb-3 max-md:px-4"
      />
    </Card>
  );
}

export function ServiceByAssignee({ rows }: { readonly rows: readonly AssigneeRow[] }) {
  const t = useTranslations('serviceReport.tables');
  const columns: TableColumn<AssigneeRow>[] = [
    {
      key: 'person',
      header: t('person'),
      primary: true,
      cell: (row) => <span className="font-medium text-ink">{row.name ?? t('unassigned')}</span>,
    },
    { key: 'resolved', header: t('resolved'), align: 'end', cell: (row) => number(row.resolved) },
    { key: 'open', header: t('open'), align: 'end', cell: (row) => number(row.openNow, true) },
    {
      key: 'hours',
      header: t('hours'),
      align: 'end',
      cell: (row) => (
        <span className={`${NUM} text-ink-muted`}>{decimal(row.averageResolutionHours)}</span>
      ),
    },
  ];
  return (
    <Card>
      <CardHeader title={t('byAssignee')} description={t('byAssigneeBody')} />
      <ResponsiveTable
        caption={t('byAssignee')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.userId ?? 'none'}
        className="px-2 pb-3 max-md:px-4"
      />
    </Card>
  );
}
