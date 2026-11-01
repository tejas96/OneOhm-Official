import type { ProjectTask } from '@oneohm/api-contracts';
import { Button } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { TASK } from '@/copy/tasks';
import { useCan } from '@/session/session-provider';
import type { useTaskActions } from './use-task-actions';

/** Back to the list once the task is done or sent for approval. */
function leaveWhenDone(updated: ProjectTask) {
  if (updated.status !== 'completed' && updated.status !== 'in_review') return;
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * The one next step for the task, pinned to the bottom: approve a review, complete work
 * in progress (not while photos are still uploading), or start / resume it.
 */
export function TaskFooter({
  task,
  actions,
  facts,
  note,
  uploading,
  onWaiting,
}: {
  readonly task: ProjectTask;
  readonly actions: ReturnType<typeof useTaskActions>;
  readonly facts: Record<string, string>;
  readonly note: string;
  readonly uploading: boolean;
  readonly onWaiting: () => void;
}) {
  const canApprove = useCan('tasks.approve');
  const blocked = task.blockedBy.length > 0;
  if (task.status === 'in_review') {
    return canApprove ? (
      <Button
        label={TASK.approve}
        size="lg"
        fullWidth
        pending={actions.approve.isPending}
        onPress={() => actions.approve.mutate(undefined, { onSuccess: leaveWhenDone })}
      />
    ) : null;
  }
  return (
    <>
      {task.status === 'in_progress' ? (
        <Button
          label={task.approval && !canApprove ? TASK.sendForApproval : TASK.complete}
          size="lg"
          fullWidth
          disabled={blocked || uploading}
          pending={actions.complete.isPending}
          onPress={() => actions.complete.mutate({ facts, note }, { onSuccess: leaveWhenDone })}
        />
      ) : (
        <Button
          label={task.status === 'waiting' ? TASK.resume : TASK.start}
          size="lg"
          fullWidth
          disabled={blocked}
          pending={actions.start.isPending}
          onPress={() => actions.start.mutate()}
        />
      )}
      <Button label={TASK.markWaiting} variant="secondary" fullWidth onPress={onWaiting} />
    </>
  );
}
