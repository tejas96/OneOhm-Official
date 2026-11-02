'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import {
  Avatar,
  cn,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { Lock, RotateCcw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { TaskTitleButton } from '../task-panel/task-title-button';
import { PriorityIcon } from '../tasks/priority-icon';
import { StaleBadge } from '../tasks/stale-badge';
import { TaskActions } from '../tasks/task-actions';
import { swatchFor } from '../tasks/task-card';
import { isBlocked, isReturned, taskStatusKey, taskTone } from '../tasks/task-status';

function TaskCell({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.task');
  const done = task.status === 'completed';
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-start gap-1.5">
          {!done && <PriorityIcon priority={task.priority} className="mt-0.5" />}
          <TaskTitleButton
            taskId={task.id}
            className={cn('type-body font-medium', done ? 'text-ink-muted' : 'text-ink')}
          >
            {task.title}
          </TaskTitleButton>
        </span>
        <StaleBadge task={task} className="type-body-sm" />
        {isBlocked(task) && (
          <span className="flex min-w-0 items-center gap-1.5 type-body-sm font-normal text-ink-faint">
            <Lock aria-hidden className="size-3 shrink-0" />
            <span className="line-clamp-1 [overflow-wrap:anywhere]">
              {t('blockedBy', { tasks: task.blockedBy.join(', ') })}
            </span>
          </span>
        )}
        {isReturned(task) && task.returned && (
          <span className="flex min-w-0 items-center gap-1.5 type-body-sm font-normal text-at-risk">
            <RotateCcw aria-hidden className="size-3 shrink-0" />
            <span className="line-clamp-1 [overflow-wrap:anywhere]">
              {t('returnedNote', { note: task.returned.note })}
            </span>
          </span>
        )}
      </div>
      {/* On phones the row is a card with no actions column, so the actions sit here. */}
      <div className="md:hidden">
        <TaskActions task={task} />
      </div>
    </div>
  );
}

/** The same tasks as the board, as one table: task, stage, who, when and status. */
export function TaskTable({ tasks }: { readonly tasks: readonly ProjectTask[] }) {
  const t = useTranslations('projects.task');
  const tableT = useTranslations('projects.tasksTab.columns');
  const partyT = useTranslations('commandCenter.party');
  const stagesT = useTranslations('stages');
  const format = useFormatter();
  const day = (date: string) => format.dateTime(new Date(date), { day: 'numeric', month: 'short' });

  const columns: TableColumn<ProjectTask>[] = [
    {
      key: 'task',
      header: tableT('task'),
      primary: true,
      className: 'w-[38%]',
      cell: (task) => <TaskCell task={task} />,
    },
    {
      key: 'stage',
      header: tableT('stage'),
      cell: (task) => <span className="text-ink-muted">{stagesT(task.stage)}</span>,
    },
    {
      key: 'assignee',
      header: tableT('assignee'),
      cell: (task) =>
        task.assignee ? (
          <span className="inline-flex items-center gap-2 text-ink-muted">
            <Avatar
              name={task.assignee.fullName}
              swatch={swatchFor(task.assignee.fullName)}
              size="sm"
              className="size-5 text-[0.5625rem]"
            />
            {task.assignee.fullName}
          </span>
        ) : (
          <span className="text-at-risk">{t('unassigned')}</span>
        ),
    },
    {
      key: 'due',
      header: tableT('due'),
      cell: (task) => {
        const done = task.status === 'completed';
        return (
          <span
            className={cn(
              'font-mono text-[0.8125rem] whitespace-nowrap tabular-nums',
              task.overdue && !done ? 'font-medium text-overdue' : 'text-ink-muted',
            )}
          >
            {done && task.completedAt
              ? t('doneOn', { date: day(task.completedAt) })
              : day(task.dueDate)}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: tableT('status'),
      cell: (task) => (
        <StatusPill
          size="sm"
          tone={taskTone(task)}
          label={
            task.status === 'waiting'
              ? t('waitingOn', { party: partyT(task.waitingParty) })
              : t(`status.${taskStatusKey(task)}`)
          }
        />
      ),
    },
    {
      key: 'actions',
      header: tableT('actions'),
      hideOnPhone: true,
      align: 'end',
      cell: (task) => (
        <span className="inline-flex justify-end">
          <TaskActions task={task} />
        </span>
      ),
    },
  ];

  return (
    <ResponsiveTable
      caption={tableT('caption')}
      columns={columns}
      rows={tasks}
      rowKey={(task) => task.id}
    />
  );
}
