import type { ProjectTask } from '@oneohm/api-contracts';

export const TODAY_GROUPS = ['overdue', 'today', 'waiting', 'upcoming'] as const;
export type TodayGroup = (typeof TODAY_GROUPS)[number];

/**
 * Where a task sits on the person's day. Tasks held by someone else (waiting, or with a
 * reviewer) sit apart so they never read as the person's own overdue work.
 */
export function groupOf(task: ProjectTask, today: string): TodayGroup {
  if (task.status === 'waiting' || task.status === 'in_review') return 'waiting';
  if (task.overdue) return 'overdue';
  if (task.dueDate <= today) return 'today';
  return 'upcoming';
}

export function groupTasks(
  tasks: readonly ProjectTask[],
  today: string,
): Record<TodayGroup, ProjectTask[]> {
  const groups: Record<TodayGroup, ProjectTask[]> = {
    overdue: [],
    today: [],
    waiting: [],
    upcoming: [],
  };
  for (const task of tasks) {
    if (task.status === 'completed') continue;
    groups[groupOf(task, today)].push(task);
  }
  return groups;
}
