'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, IconButton, Popover } from '@oneohm/design-system/web';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { TaskStep } from './task-menu';
import { useTaskSteps } from './use-task-steps';

/**
 * The one next step for a task as a button, the rest in a small menu. Only what the
 * person may do is offered (see `useTaskRights`).
 */
export function TaskActions({ task }: { readonly task: ProjectTask }) {
  const steps = useTaskSteps(task);
  return (
    <>
      <TaskStepButtons steps={steps} />
      {steps.dialogs}
    </>
  );
}

/**
 * The button and menu for steps someone already holds (the task panel), so its dialogs
 * are rendered once by that holder, never twice.
 */
export function TaskStepButtons({ steps }: { readonly steps: ReturnType<typeof useTaskSteps> }) {
  const t = useTranslations('projects.task.actions');
  const [menuOpen, setMenuOpen] = useState(false);
  const { primary, menu } = steps;
  if (!primary && menu.length === 0) return null;

  const run = (entry: TaskStep) => {
    setMenuOpen(false);
    steps.run(entry);
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {primary && (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<primary.icon />}
          pending={steps.pendingKey === primary.key}
          onClick={() => run(primary)}
        >
          {t(primary.key)}
        </Button>
      )}
      {menu.length > 0 && (
        <Popover
          label={t('more')}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          align="end"
          className="p-1"
          trigger={
            <IconButton label={t('more')} size="sm" variant="quiet">
              <Ellipsis aria-hidden />
            </IconButton>
          }
        >
          <ul className="flex min-w-52 flex-col">
            {menu.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => run(entry)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left type-body-sm text-ink hover:bg-sunken"
                >
                  <entry.icon aria-hidden className="size-4 text-ink-faint" />
                  {t(entry.key)}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </div>
  );
}
