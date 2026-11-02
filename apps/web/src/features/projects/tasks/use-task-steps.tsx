'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { type ReactNode, useState } from 'react';
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
 * What this person may do with the task: the assignee or a manager works it, managers
 * move its due date, `tasks.assign` hands it over, and its reviewers approve it.
 */
export function useTaskRights(task: ProjectTask): TaskRights {
  const user = useCurrentUser();
  const manage = useCan('tasks.assign', 'projects.manage');
  const assign = useCan('tasks.assign');
  return {
    work: task.assignee?.id === user.id || manage,
    manage,
    assign,
    review: task.reviewerIds.includes(user.id),
  };
}

/**
 * A task's steps and the dialogs behind them, so a button, a menu, a panel or a kanban
 * drop all run the same step the same way. Render `dialogs` once beside the trigger.
 */
export function useTaskSteps(task: ProjectTask): {
  readonly rights: TaskRights;
  readonly primary: TaskStep | null;
  readonly menu: readonly TaskStep[];
  readonly run: (step: TaskStep) => void;
  readonly pendingKey: string | null;
  readonly dialogs: ReactNode;
} {
  const rights = useTaskRights(task);
  const actions = useTaskActions(task);
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [session, setSession] = useState(0);

  const run = (entry: TaskStep) => {
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
  const pendingKey = actions.approve.isPending
    ? 'approve'
    : actions.start.isPending
      ? 'start'
      : null;

  return {
    rights,
    primary: primaryStep(task, rights),
    menu: menuSteps(task, rights),
    run,
    pendingKey,
    dialogs: (
      <>
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
      </>
    ),
  };
}
