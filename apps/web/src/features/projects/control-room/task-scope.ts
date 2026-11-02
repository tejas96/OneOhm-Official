import type { ProjectTask } from '@oneohm/api-contracts';

export const TASK_SCOPES = ['open', 'mine', 'blocked', 'all'] as const;
export type TaskScope = (typeof TASK_SCOPES)[number];

/**
 * Open: not done yet. Mine: open and assigned to me. Blocked: open and waiting for other
 * tasks (spec 3.4). All: everything, done included.
 */
export function inScope(task: ProjectTask, scope: TaskScope, userId: string): boolean {
  if (scope === 'all') return true;
  if (task.status === 'completed') return false;
  if (scope === 'blocked') return task.blockedBy.length > 0;
  return scope === 'open' || task.assignee?.id === userId;
}
