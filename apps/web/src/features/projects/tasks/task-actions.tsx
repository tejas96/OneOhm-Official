'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, IconButton, Popover } from '@oneohm/design-system/web';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { AssignDialog } from './assign-dialog';
import { CompleteTaskDialog } from './complete-task-dialog';
import { RescheduleDialog } from './reschedule-dialog';
import {
  type DialogName,
  menuSteps,
  primaryStep,
  type TaskRights,
  type TaskStep,
} from './task-menu';
import { TaskNoteDialog } from './task-note-dialog';
import { useTaskActions } from './use-task-actions';
import { WaitingDialog } from './waiting-dialog';

/**
 * The one next step for a task as a button, the rest in a small menu. Only what the
 * person may do is offered: the assignee or a manager works the task, managers move its
 * due date, `tasks.assign` hands it over, and its reviewers approve or send work back.
 */
export function TaskActions({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.task.actions');
  const user = useCurrentUser();
  const manage = useCan('tasks.assign', 'projects.manage');
  const assign = useCan('tasks.assign');
  const actions = useTaskActions(task);
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [session, setSession] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const rights: TaskRights = {
    work: task.assignee?.id === user.id || manage,
    manage,
    assign,
    review: task.reviewerIds.includes(user.id),
  };
  const primary = primaryStep(task, rights);
  const menu = menuSteps(task, rights);
  if (!primary && menu.length === 0) return null;

  const run = (entry: TaskStep) => {
    setMenuOpen(false);
    if ('quick' in entry.run) {
      if (entry.run.quick === 'approve') actions.approve.mutate();
      else actions.start.mutate();
      return;
    }
    setSession((value) => value + 1);
    setDialog(entry.run.dialog);
  };
  const dialogProps = (name: DialogName) => ({
    task,
    open: dialog === name,
    onOpenChange: (next: boolean) => setDialog(next ? name : null),
  });

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {primary && (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<primary.icon />}
          pending={primary.key === 'approve' ? actions.approve.isPending : actions.start.isPending}
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
      {/* A new key per opening starts each form empty. */}
      <CompleteTaskDialog
        key={`complete-${session}`}
        {...dialogProps('complete')}
        mutation={actions.complete}
      />
      <WaitingDialog
        key={`waiting-${session}`}
        {...dialogProps('waiting')}
        mutation={actions.waiting}
      />
      <AssignDialog {...dialogProps('assign')} mutation={actions.assign} />
      <RescheduleDialog
        key={`reschedule-${session}`}
        {...dialogProps('reschedule')}
        mutation={actions.reschedule}
      />
      <TaskNoteDialog
        key={`update-${session}`}
        kind="update"
        {...dialogProps('update')}
        mutation={actions.postUpdate}
      />
      <TaskNoteDialog
        key={`sendBack-${session}`}
        kind="sendBack"
        {...dialogProps('sendBack')}
        mutation={actions.sendBack}
      />
    </div>
  );
}
