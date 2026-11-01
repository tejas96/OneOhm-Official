import { addDays, daysBetween } from '@oneohm/shared';

/** When a project is expected to finish, and why (PRD 3.1 "delivery forecasts"). */
export interface DeliveryForecast {
  /** The latest due date among the open tasks: the finish the plan promises. */
  readonly plannedFinish: string | null;
  /** How many days behind the work runs now: the oldest open task's days past due. */
  readonly slipDays: number;
  /** The planned finish moved on by the slip, never before today; null once nothing is open. */
  readonly expectedFinish: string | null;
}

/**
 * One deterministic rule, easy to explain: take the last due date among the open tasks,
 * then move it on by how late the work runs today (the open task furthest past its due
 * date). A project with no late work finishes on plan; one running 4 days behind is
 * expected 4 days after its plan.
 */
export function deliveryForecast(
  openTasks: readonly { readonly dueDate: string }[],
  today: string,
): DeliveryForecast {
  if (openTasks.length === 0) return { plannedFinish: null, slipDays: 0, expectedFinish: null };
  const plannedFinish = openTasks.reduce(
    (latest, task) => (task.dueDate > latest ? task.dueDate : latest),
    openTasks[0]?.dueDate ?? today,
  );
  const slipDays = openTasks.reduce(
    (most, task) => Math.max(most, task.dueDate < today ? daysBetween(task.dueDate, today) : 0),
    0,
  );
  const shifted = addDays(plannedFinish, slipDays);
  return { plannedFinish, slipDays, expectedFinish: shifted < today ? today : shifted };
}

export const FINISH_WINDOWS = ['this_month', 'next_month', 'later'] as const;
export type FinishWindow = (typeof FINISH_WINDOWS)[number];

/** Which calendar month the expected finish falls in: this one, the next, or later. */
export function finishWindow(expectedFinish: string, today: string): FinishWindow {
  const month = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
  const ahead = month(expectedFinish) - month(today);
  if (ahead <= 0) return 'this_month';
  return ahead === 1 ? 'next_month' : 'later';
}
