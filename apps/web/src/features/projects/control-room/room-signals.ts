import type { ProjectDetail, ProjectTask } from '@oneohm/api-contracts';
import { daysBetween, todayIn } from '@oneohm/shared';

/** A task held by one or more open utility change requests (not by earlier tasks). */
export interface HeldTask {
  readonly task: ProjectTask;
  readonly requests: readonly string[];
}

/** What the room's overview, alerts and tabs say about a project, worked out once. */
export interface ProjectSignals {
  /** Every task not yet completed, soonest due first. */
  readonly open: readonly ProjectTask[];
  readonly done: number;
  readonly total: number;
  readonly overdue: readonly ProjectTask[];
  /** Marked as waiting on the customer, the bank or DISCOM. */
  readonly waitingOnOthers: readonly ProjectTask[];
  readonly heldByChange: readonly HeldTask[];
  /** Free to start (nothing ahead of it) but nobody has it. */
  readonly needsOwner: readonly ProjectTask[];
  /** Due today or tomorrow and not yet being worked on. */
  readonly dueSoon: readonly ProjectTask[];
}

const byDue = (left: ProjectTask, right: ProjectTask) => left.dueDate.localeCompare(right.dueDate);

/** Open tasks, and those an open DISCOM change request holds back (from the API). */
export function projectSignals(project: ProjectDetail, today = todayIn()): ProjectSignals {
  const open = project.tasks.filter((task) => task.status !== 'completed').sort(byDue);
  const heldByChange = open
    .map((task) => ({ task, requests: task.changeBlockers }))
    .filter((held) => held.requests.length > 0);
  return {
    open,
    done: project.tasks.length - open.length,
    total: project.tasks.length,
    overdue: open.filter((task) => task.overdue),
    waitingOnOthers: open.filter(
      (task) => task.status === 'waiting' && task.waitingParty !== 'internal',
    ),
    heldByChange,
    needsOwner: open.filter((task) => task.assignee === null && task.blockedBy.length === 0),
    dueSoon: open.filter(
      (task) =>
        !task.overdue &&
        task.status !== 'in_progress' &&
        task.blockedBy.length === 0 &&
        daysBetween(today, task.dueDate) <= 1,
    ),
  };
}

/** Every change request holding work, with how many tasks each one holds. */
export function changeRequestsHolding(
  held: readonly HeldTask[],
): { name: string; tasks: number }[] {
  const counts = new Map<string, number>();
  for (const entry of held)
    for (const name of entry.requests) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, tasks]) => ({ name, tasks }));
}
