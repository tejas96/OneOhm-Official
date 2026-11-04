'use client';

import type { SalesReport } from '@oneohm/api-contracts';
import { Card, CardHeader, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NUM, SplitBar } from '../parts/report-body';
import { formatRate, money } from '../parts/report-format';

type OwnerRow = SalesReport['byOwner'][number];
type SourceRow = SalesReport['bySource'][number];

/** "3 of 5 · 60%" with a bar: won out of leads. */
function Conversion({ won, leads, rate }: { won: number; leads: number; rate: number | null }) {
  const t = useTranslations('salesReport.tables');
  return (
    <span className="flex min-w-32 flex-col items-end gap-1 md:items-stretch">
      <span className="flex items-baseline justify-end gap-2 md:justify-between">
        <span className={`${NUM} text-ink`}>{formatRate(rate)}</span>
        <span className="type-body-sm text-ink-faint">{t('ofLeads', { won, leads })}</span>
      </span>
      <SplitBar
        className="hidden md:flex"
        total={leads}
        parts={[{ key: 'won', value: won, fill: 'bg-on-track-solid' }]}
      />
    </span>
  );
}

export function SalesByOwner({ rows }: { readonly rows: readonly OwnerRow[] }) {
  const t = useTranslations('salesReport.tables');
  const columns: TableColumn<OwnerRow>[] = [
    {
      key: 'person',
      header: t('person'),
      primary: true,
      cell: (row) => <span className="font-medium text-ink">{row.name ?? t('unassigned')}</span>,
    },
    {
      key: 'leads',
      header: t('leads'),
      align: 'end',
      cell: (row) => <span className={NUM}>{row.leads}</span>,
    },
    {
      key: 'sent',
      header: t('quotesSent'),
      align: 'end',
      cell: (row) => <span className={NUM}>{row.quotesSent}</span>,
    },
    {
      key: 'won',
      header: t('won'),
      align: 'end',
      cell: (row) => (
        <span className="flex flex-col items-end whitespace-nowrap">
          <span className={`${NUM} text-ink`}>{money(row.wonPaise)}</span>
          <span className="type-body-sm text-ink-faint">{t('orders', { count: row.won })}</span>
        </span>
      ),
    },
    {
      key: 'rate',
      header: t('conversion'),
      cell: (row) => <Conversion won={row.leadsWon} leads={row.leads} rate={row.rate} />,
    },
  ];
  return (
    <Card>
      <CardHeader title={t('byOwner')} description={t('byOwnerBody')} />
      <ResponsiveTable
        caption={t('byOwner')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.userId ?? 'none'}
        className="px-2 pb-3 max-md:px-4"
      />
    </Card>
  );
}

export function SalesBySource({ rows }: { readonly rows: readonly SourceRow[] }) {
  const t = useTranslations('salesReport.tables');
  const sources = useTranslations('salesReport.sources');
  const columns: TableColumn<SourceRow>[] = [
    {
      key: 'source',
      header: t('source'),
      primary: true,
      cell: (row) => <span className="font-medium text-ink">{sources(row.source)}</span>,
    },
    {
      key: 'leads',
      header: t('leads'),
      align: 'end',
      cell: (row) => <span className={NUM}>{row.leads}</span>,
    },
    {
      key: 'value',
      header: t('wonValue'),
      align: 'end',
      cell: (row) => <span className={`${NUM} text-ink`}>{money(row.wonPaise)}</span>,
    },
    {
      key: 'rate',
      header: t('conversion'),
      cell: (row) => <Conversion won={row.won} leads={row.leads} rate={row.rate} />,
    },
  ];
  return (
    <Card>
      <CardHeader title={t('bySource')} description={t('bySourceBody')} />
      <ResponsiveTable
        caption={t('bySource')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.source}
        className="px-2 pb-3 max-md:px-4"
      />
    </Card>
  );
}

/** Of the period's leads: how many were quoted, won and became projects. */
export function SalesFunnel({ funnel }: { readonly funnel: SalesReport['funnel'] }) {
  const t = useTranslations('salesReport.funnel');
  const steps = [
    { key: 'leads', value: funnel.leads },
    { key: 'quoted', value: funnel.quoted },
    { key: 'won', value: funnel.won },
    { key: 'projects', value: funnel.projects },
  ] as const;
  return (
    <Card>
      <CardHeader title={t('title')} description={t('body')} />
      <ol className="flex flex-col gap-4 px-5 pb-5">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="type-body text-ink">{t(step.key)}</span>
              <span className="flex items-baseline gap-2">
                <span className={`${NUM} text-ink`}>{step.value}</span>
                <span className="w-10 text-right type-body-sm text-ink-faint">
                  {formatRate(funnel.leads ? step.value / funnel.leads : null)}
                </span>
              </span>
            </span>
            <SplitBar
              total={funnel.leads}
              parts={[{ key: step.key, value: step.value, fill: 'bg-accent' }]}
            />
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function LostReasons({ rows }: { readonly rows: SalesReport['lostReasons'] }) {
  const t = useTranslations('salesReport.lost');
  return (
    <Card>
      <CardHeader title={t('title')} description={t('body')} />
      <div className="px-5 pb-5">
        {rows.length === 0 ? (
          <p className="type-body-sm text-ink-muted">{t('none')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {rows.map((row) => (
              <li key={row.reason} className="flex items-baseline justify-between gap-3 py-2">
                <span className="type-body-sm text-ink">{row.reason || t('noReason')}</span>
                <span className={`${NUM} text-ink`}>{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
