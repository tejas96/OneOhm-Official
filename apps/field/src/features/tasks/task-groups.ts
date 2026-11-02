import type { ProjectTask } from '@oneohm/api-contracts';
import { rankTasks } from '@oneohm/domain';

/** Shown in this order: what needs the person's attention first (PRD 4.1). */
export const TASK_GROUPS = [
  'returned',
  'help',
  'overdue',
  'today',
  'upcoming',
  'waiting',
  'review',
] as const;
export type TaskGroup = (typeof TASK_GROUPS)[number];

/**
 * Where a task sits on the Today screen (PRD 4.1). Work sent back for correction comes
 * first; help asked of the OneOhm team and waiting on others sit apart, so a task someone
 * else holds never reads as the person's overdue work.
 */
export function groupOf(task: ProjectTask, today: string): TaskGroup {
  if (task.status === 'in_review') return 'review';
  if (task.status === 'waiting') return task.waitingParty === 'internal' ? 'help' : 'waiting';
  if (task.returned) return 'returned';
  if (task.overdue || task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
}

export function groupTasks(
  tasks: readonly ProjectTask[],
  today: string,
): Readonly<Record<TaskGroup, ProjectTask[]>> {
  const groups = Object.fromEntries(TASK_GROUPS.map((group) => [group, []])) as unknown as Record<
    TaskGroup,
    ProjectTask[]
  >;
  for (const task of tasks) groups[groupOf(task, today)].push(task);
  // The person's own work in do-next order (spec 3.3); work others hold, by due date.
  for (const group of TASK_GROUPS) {
    groups[group] =
      group === 'waiting' || group === 'review'
        ? groups[group].sort((left, right) => left.dueDate.localeCompare(right.dueDate))
        : rankTasks(groups[group], today);
  }
  return groups;
}

/** Share of the person's own open work that is not overdue (0–1). */
export function onTimeShare(groups: Readonly<Record<TaskGroup, readonly ProjectTask[]>>): number {
  const flagged = [...groups.returned, ...groups.help];
  const own = groups.overdue.length + groups.today.length + groups.upcoming.length + flagged.length;
  if (own === 0) return 1;
  const late = groups.overdue.length + flagged.filter((task) => task.overdue).length;
  return 1 - late / own;
}
