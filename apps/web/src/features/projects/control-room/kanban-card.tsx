'use client';

import { useDraggable } from '@dnd-kit/core';
import type { ProjectTask } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { ArrowRight, CalendarClock, GripVertical, Lock } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { TaskTitleButton } from '../task-panel/task-title-button';
import { ReworkBadge } from '../tasks/task-card-notes';
import type { TaskRights, TaskStep } from '../tasks/task-menu';
import { isBlocked } from '../tasks/task-status';
import { useTaskSteps } from '../tasks/use-task-steps';

/** What the board needs from a card to act on a drop: who may do what, and how. */
export interface CardRunner {
  readonly rights: TaskRights;
  readonly run: (step: TaskStep) => void;
}

/**
 * One task on the kanban. Only the grip starts a drag, so the title still opens the
 * panel. The card keeps its own dialogs, so a drop opens the same form as a button.
 */
export function KanbanCard({
  task,
  register,
}: {
  readonly task: ProjectTask;
  readonly register: (id: string, runner: CardRunner | null) => void;
}) {
  const t = useTranslations('projects.kanban');
  const taskT = useTranslations('projects.task');
  const stagesT = useTranslations('stages');
  const format = useFormatter();
  const steps = useTaskSteps(task);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  const done = task.status === 'completed';
  const blocked = isBlocked(task);

  useEffect(() => {
    register(task.id, { rights: steps.rights, run: steps.run });
    return () => register(task.id, null);
  });

  return (
    <li
      ref={setNodeRef}
      className={cn(
        'flex gap-2 rounded-lg border border-hairline bg-surface p-3 shadow-e1',
        isDragging && 'opacity-40',
      )}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label={t('drag', { title: task.title })}
        className="-ml-1 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-ink-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-focus active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <TaskTitleButton
          taskId={task.id}
          className={cn(
            'type-body font-medium [overflow-wrap:anywhere]',
            done ? 'text-ink-muted' : 'text-ink',
          )}
        >
          {task.title}
        </TaskTitleButton>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body-sm text-ink-muted">
          <span className={task.assignee ? '' : 'text-at-risk'}>
            {task.assignee?.fullName ?? taskT('unassigned')}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1',
              task.overdue && !done && 'font-medium text-overdue',
            )}
          >
            <CalendarClock aria-hidden className="size-3.5" />
            {format.dateTime(new Date(task.dueDate), { day: 'numeric', month: 'short' })}
          </span>
          <span className="text-ink-faint">{stagesT(task.stage)}</span>
          <ReworkBadge count={task.reworkCount} />
        </div>
        {blocked && (
          <p className="flex items-start gap-1.5 type-body-sm text-ink-faint">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2 [overflow-wrap:anywhere]">
              {t('waitingFor', { tasks: task.blockedBy.join(', ') })}
            </span>
          </p>
        )}
        {!done && task.blocking.length > 0 && (
          <p className="flex items-center gap-1.5 type-body-sm text-at-risk">
            <ArrowRight aria-hidden className="size-3.5 shrink-0" />
            {t('blocking', { count: task.blocking.length })}
          </p>
        )}
      </div>
      {steps.dialogs}
    </li>
  );
}
