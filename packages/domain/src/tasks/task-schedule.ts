import { addDays, daysBetween } from '@oneohm/shared';

/** One task in a project's plan, as the date shift needs it. */
export interface PlannedTask {
  readonly id: string;
  readonly startDate: string;
  readonly dueDate: string;
  /** The day it was finished (India time), or null while it is open. */
  readonly finishedOn: string | null;
}

export interface TaskLink {
  readonly taskId: string;
  readonly dependsOnTaskId: string;
}

export interface DateShift {
  readonly id: string;
  readonly startDate: string;
  readonly dueDate: string;
  /** How many days later it now is. */
  readonly days: number;
}

/** When a task's work really ends: its finish day once done, its due date while open. */
const endOf = (task: PlannedTask) => task.finishedOn ?? task.dueDate;

/**
 * The open tasks that must move later because `changed` now ends on `endsOn` (it finished
 * late, or a manager gave it a later due date). The plan's own rule (a task starts once
 * everything it waits for is due) is applied again down the chain: each waiting task moves
 * by the slip, less any slack it already had, keeping its length. Dates never move earlier,
 * done tasks never move, and a task waiting on two late tasks moves once, by the larger slip.
 */
export function shiftDependents(
  tasks: readonly PlannedTask[],
  links: readonly TaskLink[],
  changed: { readonly id: string; readonly endsOn: string },
): DateShift[] {
  const current = new Map(tasks.map((task) => [task.id, task]));
  const self = current.get(changed.id);
  if (!self) return [];
  current.set(changed.id, { ...self, dueDate: changed.endsOn, finishedOn: changed.endsOn });

  const waitsOn = (id: string) =>
    links.filter((link) => link.taskId === id).map((link) => link.dependsOnTaskId);
  const waitedOnBy = (id: string) =>
    links.filter((link) => link.dependsOnTaskId === id).map((link) => link.taskId);

  const moved = new Map<string, DateShift>();
  const queue = [...waitedOnBy(changed.id)];
  // A plan is acyclic, so each task settles after a bounded number of visits.
  let budget = tasks.length * tasks.length + 1;
  while (queue.length > 0 && budget > 0) {
    budget -= 1;
    const id = queue.shift() as string;
    const task = current.get(id);
    if (!task || task.finishedOn !== null) continue;
    const ready = waitsOn(id)
      .map((before) => current.get(before))
      .filter((before): before is PlannedTask => before !== undefined)
      .reduce((latest, before) => (endOf(before) > latest ? endOf(before) : latest), '');
    if (!ready || ready <= task.startDate) continue;
    const days = daysBetween(task.startDate, ready);
    const next = { ...task, startDate: ready, dueDate: addDays(task.dueDate, days) };
    current.set(id, next);
    const original = tasks.find((item) => item.id === id) ?? task;
    moved.set(id, {
      id,
      startDate: next.startDate,
      dueDate: next.dueDate,
      days: daysBetween(original.dueDate, next.dueDate),
    });
    queue.push(...waitedOnBy(id));
  }
  return [...moved.values()];
}

/** Days a task finished after its due date; 0 when on time or early. */
export function slipDays(dueDate: string, finishedOn: string): number {
  return Math.max(0, daysBetween(dueDate, finishedOn));
}
