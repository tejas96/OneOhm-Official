'use client';

import type { DelaysReport } from '@oneohm/api-contracts';
import { Card, CardHeader, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { NUM } from '../parts/report-body';
import { decimal } from '../parts/report-format';
import { PartyTag } from './delay-party';

type StepRow = DelaysReport['steps'][number];
type DiscomRow = DelaysReport['discoms'][number];
type WaitingRow = DelaysReport['waiting'][number];

const Days = ({ value, warn = false }: { readonly value: number; readonly warn?: boolean }) => (
  <span className={`${NUM} ${warn && value > 0 ? 'text-overdue' : 'text-ink'}`}>{value}</span>
);

/** A number with a quieter line under it, right-aligned in its column. */
const Stacked = ({ main, sub }: { readonly main: ReactNode; readonly sub?: ReactNode }) => (
  <span className="flex flex-col items-end whitespace-nowrap">
    {main}
    {sub && <span className="type-body-sm text-ink-faint">{sub}</span>}
  </span>
);

function TableCard<T>({
  title,
  body,
  none,
  rows,
  columns,
  rowKey,
}: {
  readonly title: string;
  readonly body: string;
  readonly none: string;
  readonly rows: readonly T[];
  readonly columns: readonly TableColumn<T>[];
  readonly rowKey: (row: T) => string;
}) {
  return (
    <Card>
      <CardHeader title={title} description={body} />
      {rows.length === 0 ? (
        <p className="px-5 pb-5 type-body-sm text-ink-muted">{none}</p>
      ) : (
        <ResponsiveTable
          caption={title}
          columns={columns}
          rows={rows}
          rowKey={rowKey}
          className="px-2 pb-3 max-md:px-4"
        />
      )}
    </Card>
  );
}

export function SlowestSteps({ rows }: { readonly rows: readonly StepRow[] }) {
  const t = useTranslations('delaysReport.steps');
  const stages = useTranslations('delaysReport.stages');
  const columns: TableColumn<StepRow>[] = [
    {
      key: 'step',
      header: t('step'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-ink">{row.title}</span>
          <span className="type-body-sm text-ink-faint">{stages(row.stage)}</span>
        </span>
      ),
    },
    { key: 'cause', header: t('cause'), cell: (row) => <PartyTag party={row.party} /> },
    {
      key: 'late',
      header: t('late'),
      align: 'end',
      cell: (row) => (
        <Stacked
          main={<Days value={row.late} />}
          sub={row.open > 0 ? t('stillOpen', { count: row.open }) : undefined}
        />
      ),
    },
    {
      key: 'days',
      header: t('days'),
      align: 'end',
      cell: (row) => <Days value={row.days} warn />,
    },
    {
      key: 'average',
      header: t('average'),
      align: 'end',
      cell: (row) => <span className={`${NUM} text-ink-muted`}>{decimal(row.averageDays)}</span>,
    },
  ];
  return (
    <TableCard
      title={t('title')}
      body={t('body')}
      none={t('none')}
      rows={rows}
      columns={columns}
      rowKey={(row) => row.templateKey}
    />
  );
}

export function DiscomTime({ rows }: { readonly rows: readonly DiscomRow[] }) {
  const t = useTranslations('delaysReport.discoms');
  const columns: TableColumn<DiscomRow>[] = [
    {
      key: 'discom',
      header: t('discom'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-ink">{row.code}</span>
          <span title={row.name} className="block max-w-56 truncate type-body-sm text-ink-faint">
            {row.name}
          </span>
        </span>
      ),
    },
    {
      key: 'finished',
      header: t('finished'),
      align: 'end',
      cell: (row) => (
        <Stacked
          main={<Days value={row.finished} />}
          sub={t('lateOf', { late: row.late, finished: row.finished })}
        />
      ),
    },
    {
      key: 'days',
      header: t('lateDays'),
      align: 'end',
      cell: (row) => <Days value={row.lateDays} warn />,
    },
    {
      key: 'average',
      header: t('average'),
      align: 'end',
      cell: (row) => <span className={`${NUM} text-ink`}>{decimal(row.averageDays)}</span>,
    },
    {
      key: 'open',
      header: t('open'),
      align: 'end',
      cell: (row) => (
        <Stacked
          main={<Days value={row.openNow} />}
          sub={row.openLate > 0 ? t('openLate', { count: row.openLate }) : undefined}
        />
      ),
    },
  ];
  return (
    <TableCard
      title={t('title')}
      body={t('body')}
      none={t('none')}
      rows={rows}
      columns={columns}
      rowKey={(row) => row.discomId}
    />
  );
}

export function WaitingNow({ rows }: { readonly rows: readonly WaitingRow[] }) {
  const t = useTranslations('delaysReport.waiting');
  const format = useFormatter();
  const due = (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00`), { day: 'numeric', month: 'short' });
  const columns: TableColumn<WaitingRow>[] = [
    {
      key: 'task',
      header: t('task'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/projects/${row.projectId}?tab=tasks`}
            className="oh-stretched-link truncate rounded-sm font-medium text-ink"
          >
            {row.title}
          </Link>
          <span className="truncate type-body-sm text-ink-faint">
            {row.projectCode} · {row.projectName}
          </span>
        </span>
      ),
    },
    { key: 'cause', header: t('cause'), cell: (row) => <PartyTag party={row.party} /> },
    {
      key: 'late',
      header: t('late'),
      align: 'end',
      cell: (row) => (
        <Stacked
          main={
            row.daysLate > 0 ? (
              <Days value={row.daysLate} warn />
            ) : (
              <span className="type-body-sm text-ink-faint">{t('notDue')}</span>
            )
          }
          sub={t('due', { date: due(row.dueDate) })}
        />
      ),
    },
    {
      key: 'waiting',
      header: t('waitingDays'),
      align: 'end',
      cell: (row) => (
        <span className={`${NUM} text-ink-muted`}>
          {row.waitingDays === null ? '–' : row.waitingDays}
        </span>
      ),
    },
  ];
  return (
    <TableCard
      title={t('title')}
      body={t('body')}
      none={t('none')}
      rows={rows}
      columns={columns}
      rowKey={(row) => row.taskId}
    />
  );
}
