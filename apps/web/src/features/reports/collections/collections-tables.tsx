'use client';

import type { CollectionsReport } from '@oneohm/api-contracts';
import { ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NUM, SplitBar } from '../parts/report-body';
import { money } from '../parts/report-format';
import { Figure, TABLE, TableCard } from './collections-parts';

type MethodRow = CollectionsReport['byMethod'][number];
type AgeRow = {
  readonly key: string;
  readonly label: string;
  readonly customerPaise: number;
  readonly bankPaise: number;
  readonly milestones: number;
};

/** What has fallen due and is unpaid, by age, for customers and the bank. */
export function AgeingTable({ rows }: { readonly rows: CollectionsReport['ageing'] }) {
  const t = useTranslations('collectionsReport.ageing');
  const owed = rows.reduce((sum, row) => sum + row.customerPaise + row.bankPaise, 0);
  const view: AgeRow[] = [
    ...rows.map((row) => ({ ...row, key: row.bucket, label: t(`buckets.${row.bucket}`) })),
    {
      key: 'total',
      label: t('total'),
      customerPaise: rows.reduce((sum, row) => sum + row.customerPaise, 0),
      bankPaise: rows.reduce((sum, row) => sum + row.bankPaise, 0),
      milestones: rows.reduce((sum, row) => sum + row.milestones, 0),
    },
  ];
  const columns: TableColumn<AgeRow>[] = [
    {
      key: 'age',
      header: t('age'),
      primary: true,
      cell: (row) => (
        <span className="flex flex-col">
          <span className={row.key === 'total' ? 'font-medium text-ink' : 'text-ink'}>
            {row.label}
          </span>
          <span className="type-body-sm text-ink-faint">
            {t('milestones', { count: row.milestones })}
          </span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: t('customer'),
      align: 'end',
      cell: (row) => <Figure value={money(row.customerPaise)} />,
    },
    {
      key: 'bank',
      header: t('bank'),
      align: 'end',
      cell: (row) => <Figure value={money(row.bankPaise)} />,
    },
    {
      key: 'total',
      header: t('total'),
      cell: (row) => (
        <span className="flex min-w-24 flex-col items-end gap-1 md:items-stretch">
          <span className={`${NUM} text-right text-ink`}>
            {money(row.customerPaise + row.bankPaise)}
          </span>
          {row.key !== 'total' && (
            <SplitBar
              className="hidden md:flex"
              total={owed}
              parts={[
                { key: 'customer', value: row.customerPaise, fill: 'bg-on-track-solid' },
                { key: 'bank', value: row.bankPaise, fill: 'bg-party-bank' },
              ]}
            />
          )}
        </span>
      ),
    },
  ];
  return (
    <TableCard title={t('title')} body={t('body')} empty={null}>
      <ResponsiveTable
        caption={t('title')}
        columns={columns}
        rows={view}
        rowKey={(row) => row.key}
        className={TABLE}
      />
    </TableCard>
  );
}

/** Money in and back out by payment method. */
export function CollectedByMethod({ rows }: { readonly rows: readonly MethodRow[] }) {
  const t = useTranslations('collectionsReport.methods');
  const received = rows.reduce((sum, row) => sum + row.receivedPaise, 0);
  const columns: TableColumn<MethodRow>[] = [
    {
      key: 'method',
      header: t('method'),
      primary: true,
      cell: (row) => <span className="text-ink">{t(`names.${row.method}`)}</span>,
    },
    {
      key: 'received',
      header: t('received'),
      cell: (row) => (
        <span className="flex min-w-24 flex-col items-end gap-1 md:items-stretch">
          <span className={`${NUM} text-right text-ink`}>{money(row.receivedPaise)}</span>
          <SplitBar
            className="hidden md:flex"
            total={received}
            parts={[{ key: 'in', value: row.receivedPaise, fill: 'bg-accent' }]}
          />
        </span>
      ),
    },
    {
      key: 'returned',
      header: t('returned'),
      align: 'end',
      cell: (row) => (
        <span className={`${NUM} ${row.returnedPaise > 0 ? 'text-overdue' : 'text-ink-faint'}`}>
          {money(row.returnedPaise)}
        </span>
      ),
    },
    {
      key: 'net',
      header: t('net'),
      align: 'end',
      cell: (row) => <Figure value={money(row.netPaise)} />,
    },
  ];
  return (
    <TableCard title={t('title')} body={t('body')} empty={rows.length === 0 ? t('none') : null}>
      <ResponsiveTable
        caption={t('title')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.method}
        className={TABLE}
      />
    </TableCard>
  );
}
