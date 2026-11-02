'use client';

import type { TaskBoardRow } from '@oneohm/api-contracts';
import {
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { TaskTitleButton } from '@/features/projects/task-panel/task-title-button';

const TONE: Readonly<Record<TaskBoardRow['status'], PillTone>> = {
  pending: 'neutral',
  ready: 'neutral',
  in_progress: 'onTrack',
  waiting: 'waiting',
  in_review: 'review',
  completed: 'done',
};

/** One row per task: what, which project, who, when it was due, and where it stands. */
export function TaskBoardTable({ rows }: { readonly rows: readonly TaskBoardRow[] }) {
  const t = useTranslations('commandCenter.taskBoard');
  const stagesT = useTranslations('stages');
  const partyT = useTranslations('commandCenter.party');
  const format = useFormatter();
  const date = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), { day: 'numeric', month: 'short' });
  const columns: TableColumn<TaskBoardRow>[] = [
    {
      key: 'task',
      header: t('columns.task'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <TaskTitleButton taskId={row.id} className="type-body font-medium text-ink">
            {row.title}
          </TaskTitleButton>
          <Link
            href={`/projects/${row.projectId}?tab=tasks&layout=list`}
            className="type-body-sm text-ink-faint hover:text-accent hover:underline"
          >
            <span className="font-mono text-[0.75rem]">{row.projectCode}</span> · {row.projectName}
          </Link>
        </span>
      ),
    },
    {
      key: 'stage',
      header: t('columns.stage'),
      hideOnPhone: true,
      cell: (row) => <span className="type-body-sm text-ink-muted">{stagesT(row.stage)}</span>,
    },
    {
      key: 'who',
      header: t('columns.who'),
      cell: (row) => (
        <span className="flex flex-col type-body-sm">
          <span className={row.assignee ? 'text-ink' : 'text-at-risk'}>
            {row.assignee?.name ?? t('nobody')}
          </span>
          {row.contractorName && <span className="text-ink-faint">{row.contractorName}</span>}
        </span>
      ),
    },
    {
      key: 'due',
      header: t('columns.due'),
      cell: (row) => (
        <span className="flex flex-col whitespace-nowrap type-body-sm">
          <span className="text-ink">{date(row.dueDate)}</span>
          {row.daysLate > 0 && (
            <span className="text-overdue">{t('late', { days: row.daysLate })}</span>
          )}
          {row.completedOn && (
            <span className="text-ink-faint">{t('doneOn', { date: date(row.completedOn) })}</span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <StatusPill size="sm" tone={TONE[row.status]} label={t(`status.${row.status}`)} />
          {row.status === 'waiting' && (
            <span className="type-label text-ink-faint">{partyT(row.waitingParty)}</span>
          )}
        </span>
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
    />
  );
}
