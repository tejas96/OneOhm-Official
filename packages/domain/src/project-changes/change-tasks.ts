import { addDays, daysBetween } from '@oneohm/shared';
import {
  type DateShift,
  type PlannedTask,
  shiftDependents,
  type TaskLink,
} from '../tasks/task-schedule';
import { appliesTo, type ProjectFacts, type TaskTemplate } from '../tasks/task-template';

/** One task already on the project, as the change plan needs it. */
export interface ExistingTask extends PlannedTask {
  readonly key: string;
  readonly title: string;
  readonly status: string;
  readonly startedAt: string | null;
}

export interface TaskAddition {
  readonly key: string;
  readonly title: string;
  readonly startDate: string;
  readonly dueDate: string;
  /** Task keys it waits for, already on the project or added with it. */
  readonly dependsOn: readonly string[];
  /** Open tasks on the project that will wait for it. */
  readonly dependentIds: readonly string[];
}

export interface TaskRef {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly status: string;
}

export interface TaskPlan {
  readonly added: readonly TaskAddition[];
  /** No longer needed and nobody started them: they come off the project. */
  readonly removed: readonly TaskRef[];
  /** No longer needed but already started: they stay for a person to close. */
  readonly kept: readonly TaskRef[];
  /** Open tasks that move later because they now wait for an added task. */
  readonly shifts: readonly DateShift[];
  readonly finishBefore: string | null;
  readonly finishAfter: string | null;
  /** How many days the last task's end moves (negative when it ends sooner). */
  readonly finishMoveDays: number;
}

export interface TaskPlanInput {
  readonly library: readonly TaskTemplate[];
  readonly before: ProjectFacts;
  readonly after: ProjectFacts;
  readonly tasks: readonly ExistingTask[];
  readonly links: readonly TaskLink[];
  readonly today: string;
}

const NEW = 'new:';
const endOf = (task: PlannedTask) => task.finishedOn ?? task.dueDate;
const untouched = (task: ExistingTask) =>
  (task.status === 'pending' || task.status === 'ready') && !task.startedAt;
const ref = ({ id, key, title, status }: ExistingTask): TaskRef => ({ id, key, title, status });

function lastEnd(tasks: readonly PlannedTask[]): string | null {
  return tasks.reduce<string | null>(
    (latest, task) => (latest === null || endOf(task) > latest ? endOf(task) : latest),
    null,
  );
}

/** Tasks whose condition held before the change and no longer does. */
function dropped(input: TaskPlanInput) {
  const byKey = new Map(input.library.map((template) => [template.key, template]));
  const leaving = input.tasks.filter((task) => {
    const template = byKey.get(task.key);
    if (!template || task.status === 'completed') return false;
    return appliesTo(template.when, input.before) && !appliesTo(template.when, input.after);
  });
  return {
    removed: leaving.filter(untouched).map(ref),
    kept: leaving.filter((task) => !untouched(task)).map(ref),
  };
}

/** New tasks in library order, dated after what they wait for and never before today. */
function additions(input: TaskPlanInput, staying: readonly ExistingTask[]): TaskAddition[] {
  const have = new Set(input.tasks.map((task) => task.key));
  const ends = new Map(staying.map((task) => [task.key, endOf(task)]));
  const added: TaskAddition[] = [];
  for (const template of input.library) {
    if (have.has(template.key)) continue;
    if (appliesTo(template.when, input.before) || !appliesTo(template.when, input.after)) continue;
    const dependsOn = template.dependsOn.filter((key) => ends.has(key));
    const startDate = dependsOn.reduce(
      (latest, key) => ((ends.get(key) ?? '') > latest ? (ends.get(key) as string) : latest),
      input.today,
    );
    const dueDate = addDays(startDate, template.durationDays);
    ends.set(template.key, dueDate);
    const dependentIds = staying
      .filter((task) => task.status !== 'completed')
      .filter((task) =>
        input.library.find((t) => t.key === task.key)?.dependsOn.includes(template.key),
      )
      .map((task) => task.id);
    added.push({
      key: template.key,
      title: template.title,
      startDate,
      dueDate,
      dependsOn,
      dependentIds,
    });
  }
  return added;
}

/** Links for the added tasks: to what they wait for, and from the open tasks that wait. */
function addedLinks(staying: readonly ExistingTask[], added: readonly TaskAddition[]): TaskLink[] {
  const ids = new Map(staying.map((task) => [task.key, task.id]));
  for (const task of added) ids.set(task.key, `${NEW}${task.key}`);
  return added.flatMap((task) => [
    ...task.dependsOn.flatMap((key) => {
      const before = ids.get(key);
      return before ? [{ taskId: `${NEW}${task.key}`, dependsOnTaskId: before }] : [];
    }),
    ...task.dependentIds.map((taskId) => ({ taskId, dependsOnTaskId: `${NEW}${task.key}` })),
  ]);
}

/** Moves the open tasks (and added ones) that now wait for an added task, by the shift rule. */
function shiftsFor(
  staying: readonly ExistingTask[],
  links: readonly TaskLink[],
  added: readonly TaskAddition[],
) {
  const asPlanned = (task: TaskAddition): PlannedTask => ({
    id: `${NEW}${task.key}`,
    startDate: task.startDate,
    dueDate: task.dueDate,
    finishedOn: null,
  });
  let current: PlannedTask[] = [...staying, ...added.map(asPlanned)];
  const allLinks = [...links, ...addedLinks(staying, added)];
  for (const task of added) {
    const id = `${NEW}${task.key}`;
    const endsOn = current.find((row) => row.id === id)?.dueDate ?? task.dueDate;
    const moves = new Map(shiftDependents(current, allLinks, { id, endsOn }).map((m) => [m.id, m]));
    current = current.map((row) => {
      const move = moves.get(row.id);
      return move ? { ...row, startDate: move.startDate, dueDate: move.dueDate } : row;
    });
  }
  const shifts = staying.flatMap((task): DateShift[] => {
    const now = current.find((row) => row.id === task.id);
    if (!now || now.dueDate === task.dueDate) return [];
    const days = daysBetween(task.dueDate, now.dueDate);
    return [{ id: task.id, startDate: now.startDate, dueDate: now.dueDate, days }];
  });
  const dated = added.map((task) => {
    const now = current.find((row) => row.id === `${NEW}${task.key}`);
    return now ? { ...task, startDate: now.startDate, dueDate: now.dueDate } : task;
  });
  return { shifts, planned: current, added: dated };
}

/**
 * What a change does to the project's tasks (PRD 3.6, 3.7): tasks whose condition starts
 * to hold are added (a battery adds its procurement and installation), tasks whose
 * condition stops holding come off if nobody started them, and the dates that now wait
 * for an added task move later by the same rule as a late task. Done work never changes.
 */
export function planTaskChange(input: TaskPlanInput): TaskPlan {
  const { removed, kept } = dropped(input);
  const gone = new Set(removed.map((task) => task.id));
  const staying = input.tasks.filter((task) => !gone.has(task.id));
  const links = input.links.filter(
    (link) => !gone.has(link.taskId) && !gone.has(link.dependsOnTaskId),
  );
  const { shifts, planned, added } = shiftsFor(staying, links, additions(input, staying));
  const finishBefore = lastEnd(input.tasks);
  const finishAfter = lastEnd(planned);
  const finishMoveDays = finishBefore && finishAfter ? daysBetween(finishBefore, finishAfter) : 0;
  return { added, removed, kept, shifts, finishBefore, finishAfter, finishMoveDays };
}

/**
 * Pending and ready tasks once the plan applies: a task is ready when everything it
 * waits for is done, and goes back to pending when it now waits for an added one.
 */
export function readinessAfter(
  tasks: readonly { readonly id: string; readonly status: string }[],
  links: readonly TaskLink[],
): { readonly id: string; readonly status: 'pending' | 'ready' }[] {
  const ids = new Set(tasks.map((task) => task.id));
  const done = new Set(tasks.filter((task) => task.status === 'completed').map((task) => task.id));
  const open = (link: TaskLink) => ids.has(link.dependsOnTaskId) && !done.has(link.dependsOnTaskId);
  return tasks.flatMap((task) => {
    if (task.status !== 'pending' && task.status !== 'ready') return [];
    const waiting = links.some((link) => link.taskId === task.id && open(link));
    const status = waiting ? 'pending' : 'ready';
    return status === task.status ? [] : [{ id: task.id, status }];
  });
}
