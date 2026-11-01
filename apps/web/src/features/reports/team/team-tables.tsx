'use client';

import type { TeamReport } from '@oneohm/api-contracts';
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
import { decimal, formatRate } from '../parts/report-format';

type PersonRow = TeamReport['people'][number];
type CrewRow = TeamReport['crews'][number];
type Work = Pick<
  PersonRow,
  'finished' | 'onTime' | 'late' | 'lateOnOthers' | 'onTimeRate' | 'reworked' | 'firstTimeRightRate'
>;

const Count = ({ value, warn = false }: { readonly value: number; readonly warn?: boolean }) => (
  <span className={`${NUM} ${warn && value > 0 ? 'text-overdue' : 'text-ink'}`}>{value}</span>
);

/** "75%  3 of 4" with an on-time / late bar, and late on others under it. */
function OnTime({ work }: { readonly work: Work }) {
  const t = useTranslations('teamReport.tables');
  if (work.finished === 0) {
    return <span className="type-body-sm text-ink-faint">{t('noneFinished')}</span>;
  }
  return (
    <span className="flex min-w-36 flex-col items-end gap-1 md:items-stretch">
      <span className="flex items-baseline justify-end gap-2 md:justify-between">
        <span className={`${NUM} text-ink`}>{formatRate(work.onTimeRate)}</span>
        <span className="type-body-sm text-ink-faint">
          {t('ofFinished', { onTime: work.onTime, finished: work.finished })}
        </span>
      </span>
      <SplitBar
        className="hidden md:flex"
        parts={[
          { key: 'onTime', value: work.onTime, fill: 'bg-on-track-solid' },
          { key: 'late', value: work.late, fill: 'bg-overdue-solid' },
        ]}
      />
      {work.lateOnOthers > 0 && (
        <span className="type-body-sm text-ink-faint">
          {t('lateOnOthers', { count: work.lateOnOthers })}
        </span>
      )}
    </span>
  );
}

/** Quality (PRD 3.12): the share finished without being sent back for correction. */
function FirstTimeRight({ work }: { readonly work: Work }) {
  const t = useTranslations('teamReport.tables');
  if (work.finished === 0) return <span className="type-body-sm text-ink-faint">—</span>;
  return (
    <span className="flex flex-col items-end gap-1">
      <span className={`${NUM} text-ink`}>{formatRate(work.firstTimeRightRate)}</span>
      {work.reworked > 0 && (
        <span className="type-body-sm text-ink-faint">
          {t('sentBack', { count: work.reworked })}
        </span>
      )}
    </span>
  );
}

/** The work columns staff and crews share, after their name. */
function useWorkColumns<T extends Work & { open: number; pastDue: number }>(): TableColumn<T>[] {
  const t = useTranslations('teamReport.tables');
  return [
    {
      key: 'finished',
      header: t('finished'),
      align: 'end',
      cell: (row) => <Count value={row.finished} />,
    },
    { key: 'onTime', header: t('onTime'), cell: (row) => <OnTime work={row} /> },
    {
      key: 'firstTimeRight',
      header: t('firstTimeRight'),
      align: 'end',
      cell: (row) => <FirstTimeRight work={row} />,
    },
    { key: 'open', header: t('open'), align: 'end', cell: (row) => <Count value={row.open} /> },
    {
      key: 'pastDue',
      header: t('pastDue'),
      align: 'end',
      cell: (row) => <Count value={row.pastDue} warn />,
    },
  ];
}

export function PeopleTable({ rows }: { readonly rows: readonly PersonRow[] }) {
  const t = useTranslations('teamReport.tables');
  const work = useWorkColumns<PersonRow>();
  const columns: TableColumn<PersonRow>[] = [
    {
      key: 'person',
      header: t('person'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="font-medium text-ink">{row.name}</span>
          {row.designation && (
            <span className="type-body-sm text-ink-faint">{row.designation}</span>
          )}
          {row.onLeaveToday && (
            <StatusPill tone="waiting" glyph="waiting" label={t('onLeaveToday')} size="sm" />
          )}
        </span>
      ),
    },
    ...work,
    {
      key: 'leave',
      header: t('leave'),
      align: 'end',
      cell: (row) => <span className={`${NUM} text-ink`}>{decimal(row.leaveHalfDays / 2)}</span>,
    },
    {
      key: 'present',
      header: t('present'),
      align: 'end',
      cell: (row) => <Count value={row.daysPresent} />,
    },
    {
      key: 'lateIn',
      header: t('lateCheckIns'),
      align: 'end',
      cell: (row) => <Count value={row.lateCheckIns} warn />,
    },
  ];
  return (
    <Card>
      <CardHeader title={t('people')} description={t('peopleBody')} />
      {rows.length === 0 ? (
        <p className="px-5 pb-5 type-body-sm text-ink-muted">{t('noPeople')}</p>
      ) : (
        <ResponsiveTable
          caption={t('people')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.userId}
          className="px-2 pb-3 max-md:px-4"
        />
      )}
    </Card>
  );
}

export function CrewTable({ rows }: { readonly rows: readonly CrewRow[] }) {
  const t = useTranslations('teamReport.tables');
  const work = useWorkColumns<CrewRow>();
  const columns: TableColumn<CrewRow>[] = [
    {
      key: 'crew',
      header: t('crew'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={`/contractors/${row.contractorId}`}
            className="oh-stretched-link rounded-sm font-medium text-ink"
          >
            {row.name}
          </Link>
          <span className="type-body-sm text-ink-faint">
            {t('members', { count: row.members })}
          </span>
        </span>
      ),
    },
    ...work,
  ];
  return (
    <Card>
      <CardHeader title={t('crews')} description={t('crewsBody')} />
      {rows.length === 0 ? (
        <p className="px-5 pb-5 type-body-sm text-ink-muted">{t('noCrews')}</p>
      ) : (
        <ResponsiveTable
          caption={t('crews')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.contractorId}
          className="px-2 pb-3 max-md:px-4"
        />
      )}
    </Card>
  );
}
