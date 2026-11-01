'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { isReturned } from './task-status';

/** What the task is (from its template) and, when work came back, what to fix. */
export function TaskCardNotes({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.task');
  const done = task.status === 'completed';
  return (
    <>
      {task.description && !done && (
        <p className="line-clamp-2 type-body-sm text-ink-muted">{task.description}</p>
      )}
      {isReturned(task) && task.returned && (
        <p className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2 type-body-sm text-ink">
          <RotateCcw aria-hidden className="mt-0.5 size-3.5 shrink-0 text-at-risk" />
          <span>
            <span className="font-medium">
              {t('returnedBy', { name: task.returned.by?.fullName ?? t('reviewer') })}
            </span>{' '}
            {task.returned.note}
          </span>
        </p>
      )}
    </>
  );
}

/** "Sent back twice" beside the task's other facts, once its work has come back. */
export function ReworkBadge({ count }: { readonly count: number }) {
  const t = useTranslations('projects.task');
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <RotateCcw aria-hidden className="size-3.5" />
      {t('reworkCount', { count })}
    </span>
  );
}
