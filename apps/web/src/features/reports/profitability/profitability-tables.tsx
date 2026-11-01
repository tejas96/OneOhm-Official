'use client';

import type { ProfitabilityReport } from '@oneohm/api-contracts';
import {
  Card,
  CardHeader,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { NUM, SplitBar } from '../parts/report-body';
import { formatRate, money } from '../parts/report-format';

type ProjectRow = ProfitabilityReport['byProject'][number];
type Actual = ProjectRow['actual'];

/** Where actual cost came from, each with its own fill (static classes for Tailwind). */
const SOURCES = [
  { key: 'stock', fill: 'bg-accent' },
  { key: 'vendor', fill: 'bg-review-solid' },
  { key: 'contractor', fill: 'bg-waiting-solid' },
] as const;

const parts = (actual: Actual) =>
  SOURCES.map((source) => ({
    key: source.key,
    fill: source.fill,
    value: actual[`${source.key}Paise`],
  }));

/** Above zero is over budget: shown with a plus and in red. */
const signed = (paise: number) => (paise > 0 ? `+${money(paise)}` : money(paise));

/** Actual cost so far by source against the estimate, and the estimate by kind. */
export function CostSplit({ cost }: { readonly cost: ProfitabilityReport['cost'] }) {
  const t = useTranslations('profitabilityReport.cost');
  const actual = cost.actual.stockPaise + cost.actual.vendorPaise + cost.actual.contractorPaise;
  const estimated =
    cost.estimate.materialPaise + cost.estimate.installationPaise + cost.estimate.otherPaise;
  const kinds = [
    { key: 'material', value: cost.estimate.materialPaise },
    { key: 'installation', value: cost.estimate.installationPaise },
    { key: 'other', value: cost.estimate.otherPaise },
  ] as const;
  return (
    <Card>
      <CardHeader title={t('title')} description={t('body')} />
      <div className="flex flex-col gap-5 px-5 pb-5">
        <div className="flex flex-col gap-2">
          <p className="type-title-md text-ink tabular-nums">
            {t('spentOf', { actual: money(actual), estimate: money(estimated) })}
          </p>
          <SplitBar
            className="h-2"
            total={Math.max(estimated, actual)}
            parts={parts(cost.actual)}
          />
        </div>
        <ul className="flex flex-col divide-y divide-hairline">
          {SOURCES.map((source) => (
            <li key={source.key} className="flex items-start justify-between gap-3 py-2.5">
              <span className="flex min-w-0 items-start gap-2">
                <span
                  aria-hidden
                  className={`mt-1.5 size-2.5 shrink-0 rounded-[3px] ${source.fill}`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="type-body text-ink">{t(source.key)}</span>
                  <span className="type-body-sm text-ink-faint">{t(`${source.key}Body`)}</span>
                </span>
              </span>
              <span className={`${NUM} whitespace-nowrap text-ink`}>
                {money(cost.actual[`${source.key}Paise`])}
              </span>
            </li>
          ))}
        </ul>
        <p className="type-body-sm text-ink-muted">
          {t('billsStatus', {
            paid: money(cost.bills.paidPaise),
            approved: money(cost.bills.approvedPaise),
            pending: money(cost.bills.pendingPaise),
          })}
        </p>
        <div className="flex flex-col gap-2">
          <p className="type-overline text-ink-faint">{t('estimate')}</p>
          <ul className="flex flex-col gap-1.5">
            {kinds.map((kind) => (
              <li key={kind.key} className="flex items-baseline justify-between gap-3">
                <span className="type-body-sm text-ink-muted">{t(kind.key)}</span>
                <span className={`${NUM} whitespace-nowrap text-ink`}>{money(kind.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function MarginByProject({ rows }: { readonly rows: readonly ProjectRow[] }) {
  const t = useTranslations('profitabilityReport.projects');
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
      key: 'status',
      header: t('status'),
      cell: (row) =>
        row.status === 'completed' ? (
          <StatusPill tone="done" size="sm" label={t('statuses.completed')} />
        ) : (
          <StatusPill tone="neutral" glyph="progress" size="sm" label={t('statuses.in_progress')} />
        ),
    },
    {
      key: 'contract',
      header: t('contract'),
      align: 'end',
      cell: (row) => <span className={`${NUM} text-ink`}>{money(row.contractPaise)}</span>,
    },
    {
      key: 'estimate',
      header: t('estimate'),
      align: 'end',
      cell: (row) => (
        <span className="flex flex-col items-end whitespace-nowrap">
          <span className={`${NUM} text-ink`}>{money(row.estimatedCostPaise)}</span>
          <span className="type-body-sm text-ink-faint">
            {t('estimateMargin', { rate: formatRate(row.estimatedMarginRate) })}
          </span>
        </span>
      ),
    },
    {
      key: 'actual',
      header: t('actual'),
      cell: (row) => (
        <span className="flex min-w-32 flex-col items-end gap-1 md:items-stretch">
          <span className="flex items-baseline justify-end gap-2 md:justify-between">
            <span className={`${NUM} text-ink`}>{money(row.actualCostPaise)}</span>
            <span className="type-body-sm text-ink-faint">
              {t('used', {
                rate: formatRate(
                  row.estimatedCostPaise ? row.actualCostPaise / row.estimatedCostPaise : null,
                ),
              })}
            </span>
          </span>
          <SplitBar
            className="hidden md:flex"
            total={Math.max(row.estimatedCostPaise, row.actualCostPaise)}
            parts={parts(row.actual)}
          />
        </span>
      ),
    },
    {
      key: 'variance',
      header: t('variance'),
      align: 'end',
      cell: (row) => (
        <span
          className={`${NUM} ${row.variancePaise > 0 ? 'font-medium text-overdue' : 'text-ink-muted'}`}
        >
          {signed(row.variancePaise)}
        </span>
      ),
    },
    {
      key: 'margin',
      header: t('margin'),
      align: 'end',
      cell: (row) => (
        <span
          className={`${NUM} ${row.variancePaise > 0 ? 'font-medium text-overdue' : 'text-ink'}`}
        >
          {formatRate(row.marginSoFarRate)}
        </span>
      ),
    },
  ];
  return (
    <Card>
      <CardHeader title={t('title')} description={t('body')} />
      <ResponsiveTable
        caption={t('title')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.projectId}
        className="px-2 pb-3 max-md:px-4"
      />
    </Card>
  );
}
