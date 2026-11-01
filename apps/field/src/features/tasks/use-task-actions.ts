import type { ProjectTask } from '@oneohm/api-contracts';
import type { WaitingParty } from '@oneohm/domain';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { useToast } from '@/components/toast';
import { TASK } from '@/copy/tasks';
import { activityKey } from './task-timeline';

/**
 * Start, wait, complete and approve; managers move the due date, reviewers send work back
 * and anyone working it posts an update. Each refreshes the list and the task's activity.
 */
export function useTaskActions(task: ProjectTask) {
  const client = useQueryClient();
  const toast = useToast();
  const params = { id: task.id };
  const settle = (message: string) => (updated: ProjectTask) => {
    client.setQueryData<ProjectTask[]>(keys.tasks, (current) =>
      current?.map((item) => (item.id === updated.id ? updated : item)),
    );
    client.setQueryData<ProjectTask>(keys.task(updated.id), updated);
    toast(message);
    // Refresh in the background; a finished task leaves the list once the screen has closed.
    void client.invalidateQueries({ queryKey: keys.tasks });
    void client.invalidateQueries({ queryKey: activityKey(updated.id) });
  };

  const start = useMutation({
    mutationFn: () => unwrap(api.tasks.startTask({ params })),
    onSuccess: settle(TASK.done.started),
  });
  const wait = useMutation({
    mutationFn: (input: { party: WaitingParty; note: string }) =>
      unwrap(
        api.tasks.markWaiting({
          params,
          body: { party: input.party, note: input.note.trim() || null },
        }),
      ),
    onSuccess: settle(TASK.done.waiting),
  });
  const complete = useMutation({
    mutationFn: (input: { facts: Record<string, string>; note: string }) =>
      unwrap(
        api.tasks.completeTask({
          params,
          body: {
            facts: Object.fromEntries(
              Object.entries(input.facts).filter(([, value]) => value.trim().length > 0),
            ),
            note: input.note.trim() || null,
          },
        }),
      ),
    onSuccess: (updated) =>
      settle(updated.status === 'in_review' ? TASK.done.review : TASK.done.completed)(updated),
  });
  const approve = useMutation({
    mutationFn: () => unwrap(api.tasks.approveTask({ params })),
    onSuccess: settle(TASK.done.approved),
  });
  const reschedule = useMutation({
    mutationFn: (input: { dueDate: string; reason: string }) =>
      unwrap(api.tasks.rescheduleTask({ params, body: { ...input, reason: input.reason.trim() } })),
    onSuccess: settle(TASK.done.rescheduled),
  });
  const sendBack = useMutation({
    mutationFn: (reason: string) =>
      unwrap(api.tasks.returnTask({ params, body: { reason: reason.trim() } })),
    onSuccess: settle(TASK.done.returned),
  });
  const postUpdate = useMutation({
    mutationFn: (note: string) =>
      unwrap(api.tasks.postTaskUpdate({ params, body: { note: note.trim() } })),
    onSuccess: settle(TASK.done.updated),
  });
  return { start, wait, complete, approve, reschedule, sendBack, postUpdate };
}
