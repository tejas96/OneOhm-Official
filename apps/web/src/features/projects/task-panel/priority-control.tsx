'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, Popover, useToast } from '@oneohm/design-system/web';
import type { TaskPriority } from '@oneohm/domain';
import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { PriorityIcon } from '../tasks/priority-icon';
import { useInvalidateWork } from '../tasks/use-task-actions';

/** Urgent first, then down, with "No priority" last, like Linear's menu. */
const ORDER: readonly TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none'];

/**
 * The task's priority; managers (`tasks.assign`) can change it, everyone else sees it.
 * Each change is saved at once and written to the project history by the server.
 */
export function PriorityControl({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.priority');
  const toast = useToast();
  const canSet = useCan('tasks.assign');
  const invalidate = useInvalidateWork();
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: (priority: TaskPriority) =>
      expectStatus(api.tasks.setTaskPriority({ params: { id: task.id }, body: { priority } }), 200),
    onSuccess: () => invalidate(),
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  const label = (
    <span className="inline-flex items-center gap-1.5">
      <PriorityIcon priority={task.priority} showNone />
      {t(task.priority)}
    </span>
  );
  if (!canSet || task.status === 'completed')
    return task.priority === 'none' ? null : <span className="type-body-sm">{label}</span>;

  return (
    <Popover
      label={t('set')}
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="p-1"
      trigger={
        <Button size="sm" variant="quiet" pending={save.isPending} aria-label={t('set')}>
          {label}
        </Button>
      }
    >
      <ul className="flex min-w-44 flex-col">
        {ORDER.map((value) => (
          <li key={value}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                save.mutate(value);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left type-body-sm text-ink hover:bg-sunken"
            >
              <PriorityIcon priority={value} showNone />
              <span className="flex-1">{t(value)}</span>
              {value === task.priority && <Check aria-hidden className="size-4 text-accent" />}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
