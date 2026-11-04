'use client';

import type { DeliveryReport, Tally } from '@oneohm/api-contracts';
import { Card, CardHeader, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { NUM, SplitBar } from '../parts/report-body';
import { decimal, formatRate } from '../parts/report-format';

type ProjectRow = DeliveryReport['byProject'][number];
type StageRow = DeliveryReport['byStage'][number];

/** "75%  3 on time · 1 late" with a split bar. */
export function TallyCell({ tally }: { readonly tally: Tally }) {
  const t = useTranslations('deliveryReport.tables');
  if (tally.onTime + tally.late === 0) {
    return <span className="type-body-sm text-ink-faint">{t('noneFinished')}</span>;
  }
  return (
    <span className="flex min-w-36 flex-col items-end gap-1 md:items-stretch">
      <span className="flex items-baseline justify-end gap-2 md:justify-between">
        <span className={`${NUM} text-ink`}>{formatRate(tally.onTimeRate)}</span>
        <span className="type-body-sm text-ink-faint">
          {t('tally', { onTime: tally.onTime, late: tally.late })}
        </span>
      </span>
      <SplitBar
        className="hidden md:flex"
        parts={[
          { key: 'onTime', value: tally.onTime, fill: 'bg-on-track-solid' },
          { key: 'late', value: tally.late, fill: 'bg-overdue-solid' },
        ]}
      />
    </span>
  );
}

const Overdue = ({ count }: { readonly count: number }) => (
  <span className={`${NUM} ${count > 0 ? 'text-overdue' : 'text-ink-faint'}`}>{count}</span>
);

export function DeliveryByProject({ rows }: { readonly rows: readonly ProjectRow[] }) {
  const t = useTranslations('deliveryReport.tables');
  const stages = useTranslations('deliveryReport.stages');
  const columns: TableColumn<ProjectRow>[] = [
    {
      key: 'project',
      header: t('project'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/projects/${row.projectId}?tab=tasks`}
            className="oh-stretched-link truncate rounded-sm font-medium text-ink"
          >
            {row.name}
          </Link>
          <span className="type-body-sm text-ink-faint">
            {[row.code, stages(row.stage), row.manager].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    { key: 'tasks', header: t('tasks'), cell: (row) => <TallyCell tally={row.tasks} /> },
    {
      key: 'overdue',
      header: t('overdue'),
      align: 'end',
      cell: (row) => <Overdue count={row.openOverdue} />,
    },
    {
      key: 'days',
      header: t('days'),
      align: 'end',
      hideOnPhone: true,
      cell: (row) => <span className={`${NUM} text-ink-muted`}>{row.daysRunning}</span>,
    },
  ];
  return (
    <Card>
      <CardHeader title={t('byProject')} description={t('byProjectBody')} />
      <ResponsiveTable
        caption={t('byProject')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.projectId}
        className="px-2 pb-3 max-md:px-4"
      />
    </Card>
  );
}

export function DeliveryByStage({ rows }: { readonly rows: readonly StageRow[] }) {
  const t = useTranslations('deliveryReport.tables');
  const stages = useTranslations('deliveryReport.stages');
  const columns: TableColumn<StageRow>[] = [
    {
      key: 'stage',
      header: t('stage'),
      primary: true,
      cell: (row) => <span className="font-medium text-ink">{stages(row.stage)}</span>,
    },
    { key: 'tasks', header: t('tasks'), cell: (row) => <TallyCell tally={row} /> },
    {
      key: 'late',
      header: t('daysLate'),
      align: 'end',
      cell: (row) => (
        <span className={`${NUM} text-ink-muted`}>{decimal(row.averageDaysLate)}</span>
      ),
    },
    {
      key: 'overdue',
      header: t('overdue'),
      align: 'end',
      cell: (row) => <Overdue count={row.openOverdue} />,
    },
  ];
  return (
    <Card>
      <CardHeader title={t('byStage')} description={t('byStageBody')} />
      <ResponsiveTable
        caption={t('byStage')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.stage}
        className="px-2 pb-3 max-md:px-4"
      />
    </Card>
  );
}
