import type { ProjectTask } from '@oneohm/api-contracts';
import type { projectTasks, TaskFreshness } from '@oneohm/database';
import { blockerDetails } from './task-blockers';
import type { loadTaskLinks } from './task-blocking';
import { blockingTitles } from './task-blocking';

type Links = Awaited<ReturnType<typeof loadTaskLinks>>;

interface SignalContext extends Links {
  readonly setters: readonly { readonly id: string; readonly fullName: string }[];
  readonly freshness: ReadonlyMap<string, TaskFreshness>;
  readonly today: string;
}

/**
 * What helps a person own the task (spec 3.3–3.5): what it blocks and waits for, its
 * priority and who set it, whether it unlocks a payment or an Urgent task, and whether
 * it has gone stale.
 */
export function ownershipSignals(
  task: typeof projectTasks.$inferSelect,
  context: SignalContext,
): Pick<
  ProjectTask,
  | 'blocking'
  | 'blockers'
  | 'priority'
  | 'prioritySetBy'
  | 'unlocksPayment'
  | 'blocksUrgent'
  | 'stale'
  | 'lastUpdateAt'
> {
  const done = task.status === 'completed';
  const open = (status: string) => status !== 'completed';
  const fresh = context.freshness.get(task.id);
  return {
    blocking: blockingTitles(task.id, done, context.dependents),
    blockers: done
      ? []
      : context.deps
          .filter((dep) => dep.taskId === task.id && open(dep.status))
          .map((dep) => blockerDetails(dep, context.today)),
    priority: task.priority,
    prioritySetBy: context.setters.find((user) => user.id === task.prioritySetByUserId) ?? null,
    unlocksPayment: Boolean(task.onComplete) && task.onComplete !== 'project_operational',
    blocksUrgent:
      !done &&
      context.dependents.some(
        (dep) => dep.dependsOnTaskId === task.id && open(dep.status) && dep.priority === 'urgent',
      ),
    stale: fresh?.stale ?? false,
    lastUpdateAt: (fresh?.lastUpdateAt ?? task.updatedAt).toISOString(),
  };
}
