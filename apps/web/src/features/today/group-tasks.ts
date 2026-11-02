import type { ProjectTask } from '@oneohm/api-contracts';
import { isDoFirst, rankTasks } from '@oneohm/domain';

export const TODAY_GROUPS = ['first', 'overdue', 'today', 'waiting', 'upcoming'] as const;
export type TodayGroup = (typeof TODAY_GROUPS)[number];

/**
 * Where a task sits on the person's day. Tasks held by someone else (waiting, or with a
 * reviewer) sit apart so they never read as the person's own overdue work.
 */
export function groupOf(task: ProjectTask, today: string): TodayGroup {
  if (task.status === 'waiting' || task.status === 'in_review') return 'waiting';
  if (isDoFirst(task)) return 'first';
  if (task.overdue) return 'overdue';
  if (task.dueDate <= today) return 'today';
  return 'upcoming';
}

export function groupTasks(
  tasks: readonly ProjectTask[],
  today: string,
): Record<TodayGroup, ProjectTask[]> {
  const groups: Record<TodayGroup, ProjectTask[]> = {
    first: [],
    overdue: [],
    today: [],
    waiting: [],
    upcoming: [],
  };
  for (const task of tasks) {
    if (task.status === 'completed') continue;
    groups[groupOf(task, today)].push(task);
  }
  // The person's own work in do-next order (spec 3.3); work others hold, by due date.
  groups.first = rankTasks(groups.first, today);
  groups.overdue = rankTasks(groups.overdue, today);
  groups.today = rankTasks(groups.today, today);
  groups.upcoming = rankTasks(groups.upcoming, today);
  groups.waiting.sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  return groups;
}
