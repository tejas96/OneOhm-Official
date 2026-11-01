import type { ProjectTask } from '@oneohm/api-contracts';

export const TASK_SCOPES = ['open', 'mine', 'all'] as const;
export type TaskScope = (typeof TASK_SCOPES)[number];

/** Open: not done yet. Mine: open and assigned to me. All: everything, done included. */
export function inScope(task: ProjectTask, scope: TaskScope, userId: string): boolean {
  if (scope === 'all') return true;
  if (task.status === 'completed') return false;
  return scope === 'open' || task.assignee?.id === userId;
}
