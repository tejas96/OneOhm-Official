import { daysBetween } from '@oneohm/shared';

/** Linear-style task priority (spec 3.3); `none` lets the automatic order decide. */
export const TASK_PRIORITIES = ['none', 'urgent', 'high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** What the "do next" order needs to know about a task. */
export interface RankInput {
  readonly priority: TaskPriority;
  readonly prioritySetBy: { readonly fullName: string } | null;
  readonly overdue: boolean;
  readonly dueDate: string;
  readonly startDate: string;
  readonly blocking: readonly string[];
  readonly unlocksPayment: boolean;
  readonly blocksUrgent: boolean;
  /** Earlier work it still waits for; a blocked task cannot start, so it goes last. */
  readonly blockedBy: readonly string[];
}

/** Why a task sits where it does, best reason first. */
export type DoNextReason =
  | {
      readonly kind: 'priority';
      readonly priority: 'urgent' | 'high' | 'low';
      readonly by: string | null;
    }
  | { readonly kind: 'blocksUrgent' }
  | { readonly kind: 'overdue'; readonly days: number }
  | { readonly kind: 'blocks'; readonly count: number; readonly payment: boolean }
  | { readonly kind: 'due'; readonly date: string };

/**
 * Priority bands. Urgent and anything holding up an Urgent task come first, then High,
 * then Medium and None by the automatic order, and Low last, so "Low" never jumps
 * ahead of late work.
 */
function band(task: RankInput): number {
  if (task.priority === 'urgent' || task.blocksUrgent) return 0;
  if (task.priority === 'high') return 1;
  if (task.priority === 'low') return 3;
  return 2;
}

function compare(left: RankInput, right: RankInput): number {
  return (
    Number(left.blockedBy.length > 0) - Number(right.blockedBy.length > 0) ||
    band(left) - band(right) ||
    Number(right.overdue) - Number(left.overdue) ||
    right.blocking.length - left.blocking.length ||
    Number(right.unlocksPayment) - Number(left.unlocksPayment) ||
    left.dueDate.localeCompare(right.dueDate) ||
    left.startDate.localeCompare(right.startDate)
  );
}

/**
 * Work to lift above everything else on Today (spec 3.3): it can start now and is
 * Urgent, or it holds up an Urgent task.
 */
export function isDoFirst(
  task: Pick<RankInput, 'priority' | 'blocksUrgent' | 'blockedBy'>,
): boolean {
  return task.blockedBy.length === 0 && (task.priority === 'urgent' || task.blocksUrgent);
}

/** One person's tasks in the order to do them (spec 3.3); the input is left as it was. */
export function rankTasks<T extends RankInput>(tasks: readonly T[], _today: string): T[] {
  return [...tasks].sort(compare);
}

/** The one plain reason shown beside a task in Do next. */
export function doNextReason(task: RankInput, today: string): DoNextReason {
  if (task.priority === 'urgent' || task.priority === 'high')
    return { kind: 'priority', priority: task.priority, by: task.prioritySetBy?.fullName ?? null };
  // Low sits below other work on purpose; say so rather than "overdue".
  if (task.priority === 'low')
    return { kind: 'priority', priority: 'low', by: task.prioritySetBy?.fullName ?? null };
  if (task.blocksUrgent) return { kind: 'blocksUrgent' };
  if (task.overdue) return { kind: 'overdue', days: Math.max(1, daysBetween(task.dueDate, today)) };
  if (task.blocking.length > 0 || task.unlocksPayment)
    return { kind: 'blocks', count: task.blocking.length, payment: task.unlocksPayment };
  return { kind: 'due', date: task.dueDate };
}
