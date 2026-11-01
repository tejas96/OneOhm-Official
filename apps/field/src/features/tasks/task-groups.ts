import type { ProjectTask } from '@oneohm/api-contracts';

export const TASK_GROUPS = ['overdue', 'today', 'upcoming', 'waiting', 'review'] as const;
export type TaskGroup = (typeof TASK_GROUPS)[number];

/**
 * Where a task sits on the Today screen. Waiting and approval come first so a task
 * someone else holds never reads as the person's overdue work.
 */
export function groupOf(task: ProjectTask, today: string): TaskGroup {
  if (task.status === 'in_review') return 'review';
  if (task.status === 'waiting' && task.waitingParty !== 'internal') return 'waiting';
  if (task.overdue || task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

export function groupTasks(
  tasks: readonly ProjectTask[],
  today: string,
): Readonly<Record<TaskGroup, ProjectTask[]>> {
  const groups: Record<TaskGroup, ProjectTask[]> = {
    overdue: [],
    today: [],
    upcoming: [],
    waiting: [],
    review: [],
  };
  for (const task of tasks) groups[groupOf(task, today)].push(task);
  for (const list of Object.values(groups)) {
    list.sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  }
  return groups;
}

/** Share of the person's own open work that is not overdue (0–1). */
export function onTimeShare(groups: Readonly<Record<TaskGroup, readonly ProjectTask[]>>): number {
  const own = groups.overdue.length + groups.today.length + groups.upcoming.length;
  return own === 0 ? 1 : 1 - groups.overdue.length / own;
}
