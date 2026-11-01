'use client';

import type { CommandCenterQuery, TeamLoad } from '@oneohm/api-contracts';
import { Badge, type TableColumn } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { centerHref } from './center-links';

export type TeamRow =
  | TeamLoad['people'][number]
  | TeamLoad['departments'][number]
  | TeamLoad['contractors'][number];
export type TeamView = 'people' | 'departments' | 'contractors';

export const teamRowKey = (row: TeamRow) =>
  'userId' in row ? row.userId : 'contractorId' in row ? row.contractorId : (row.department ?? '');

const LINK = 'type-body font-medium text-ink underline-offset-4 hover:text-accent hover:underline';

/** The first column: a way into the person's tasks, the crew's page, or the department. */
function NameCell({
  row,
  query,
  onDepartment,
}: {
  readonly row: TeamRow;
  readonly query: CommandCenterQuery;
  readonly onDepartment: (department: string | null) => void;
}) {
  const t = useTranslations('commandCenter.team');
  if ('userId' in row)
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          href={centerHref('/command-center/tasks', query, { assignee: row.userId })}
          className={LINK}
        >
          {row.name}
        </Link>
        {row.department && <span className="type-body-sm text-ink-faint">{row.department}</span>}
        {row.onLeaveToday && <Badge variant="outline">{t('onLeave')}</Badge>}
      </span>
    );
  if ('contractorId' in row)
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Link href={`/contractors/${row.contractorId}`} className={LINK}>
          {row.name}
        </Link>
        <span className="type-body-sm text-ink-faint">{t('crew', { count: row.crew })}</span>
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onDepartment(row.department)} className={LINK}>
        {row.department ?? t('noDepartment')}
      </button>
      <span className="type-body-sm text-ink-faint">{t('peopleCount', { count: row.people })}</span>
    </span>
  );
}

const number = (value: number) => <span className="tabular-nums">{value}</span>;

/** The columns of the team table, the same for people, departments and crews. */
export function useTeamColumns(
  view: TeamView,
  query: CommandCenterQuery,
  onDepartment: (department: string | null) => void,
): readonly TableColumn<TeamRow>[] {
  const t = useTranslations('commandCenter.team');
  return [
    {
      key: 'name',
      header: t(`columns.${view}`),
      primary: true,
      cell: (row) => <NameCell row={row} query={query} onDepartment={onDepartment} />,
    },
    { key: 'open', header: t('columns.open'), align: 'end', cell: (row) => number(row.open) },
    {
      key: 'overdue',
      header: t('columns.overdue'),
      align: 'end',
      cell: (row) => (
        <span
          className={`tabular-nums ${row.overdue > 0 ? 'font-medium text-overdue' : 'text-ink-faint'}`}
        >
          {row.overdue}
        </span>
      ),
    },
    { key: 'today', header: t('columns.today'), align: 'end', cell: (row) => number(row.dueToday) },
    { key: 'done', header: t('columns.done'), align: 'end', cell: (row) => number(row.done) },
    {
      key: 'onTime',
      header: t('columns.onTime'),
      align: 'end',
      cell: (row) => (
        <span className="tabular-nums">
          {row.onTimePercent === null ? '—' : `${row.onTimePercent}%`}
        </span>
      ),
    },
    {
      key: 'rating',
      header: t('columns.rating'),
      align: 'end',
      cell: (row) => (
        <span className="tabular-nums" title={t('ratingHint', { count: row.ratings })}>
          {row.rating === null
            ? row.ratings > 0
              ? t('fewRatings', { count: row.ratings })
              : '—'
            : t('stars', { rating: row.rating, count: row.ratings })}
        </span>
      ),
    },
  ];
}
