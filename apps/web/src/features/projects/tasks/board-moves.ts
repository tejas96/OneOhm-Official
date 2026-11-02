import type { ProjectTask } from '@oneohm/api-contracts';
import { menuSteps, primaryStep, type TaskRights, type TaskStep } from './task-menu';
import { isBlocked } from './task-status';

export const BOARD_COLUMNS = [
  'pending',
  'ready',
  'in_progress',
  'waiting',
  'in_review',
  'completed',
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export type BoardMove =
  | { readonly kind: 'step'; readonly step: TaskStep }
  | {
      readonly kind: 'denied';
      readonly reason: 'blocked' | 'backwards' | 'automatic' | 'notAllowed' | 'same';
    };

/** Which task step a drop on each column means, best match first. */
const STEPS_FOR: Readonly<Record<BoardColumn, readonly string[]>> = {
  pending: [],
  ready: [],
  in_progress: ['start', 'resume', 'sendBack'],
  waiting: ['waiting'],
  in_review: ['complete'],
  completed: ['approve', 'complete'],
};

/**
 * What dropping a card on a column does. It only ever picks a step the task's own
 * buttons offer this person, so a drag can never do more than a click.
 */
export function boardMove(task: ProjectTask, to: BoardColumn, rights: TaskRights): BoardMove {
  const primary = primaryStep(task, rights);
  const offered = [...(primary ? [primary] : []), ...menuSteps(task, rights)];
  for (const key of STEPS_FOR[to]) {
    const step = offered.find((entry) => entry.key === key);
    if (step) return { kind: 'step', step };
  }
  if (to === task.status) return { kind: 'denied', reason: 'same' };
  // Not started turns Ready on its own once the work before it is done.
  if (to === 'ready' && task.status === 'pending') return { kind: 'denied', reason: 'automatic' };
  if (to === 'pending' || to === 'ready') return { kind: 'denied', reason: 'backwards' };
  if (isBlocked(task)) return { kind: 'denied', reason: 'blocked' };
  return { kind: 'denied', reason: 'notAllowed' };
}

/** Tasks by status column; overdue first, then the earliest due date. */
export function boardColumns(tasks: readonly ProjectTask[]): Record<BoardColumn, ProjectTask[]> {
  const columns = Object.fromEntries(
    BOARD_COLUMNS.map((column) => [column, [] as ProjectTask[]]),
  ) as Record<BoardColumn, ProjectTask[]>;
  for (const task of tasks) columns[task.status].push(task);
  for (const column of BOARD_COLUMNS)
    columns[column].sort(
      (left, right) =>
        Number(right.overdue) - Number(left.overdue) || left.dueDate.localeCompare(right.dueDate),
    );
  return columns;
}

/** The column an arrow key moves a picked-up card to; null for any other key. */
export function columnStep(from: BoardColumn, key: string): BoardColumn | null {
  const index = BOARD_COLUMNS.indexOf(from);
  if (key === 'ArrowRight')
    return BOARD_COLUMNS[Math.min(index + 1, BOARD_COLUMNS.length - 1)] ?? from;
  if (key === 'ArrowLeft') return BOARD_COLUMNS[Math.max(index - 1, 0)] ?? from;
  return null;
}
