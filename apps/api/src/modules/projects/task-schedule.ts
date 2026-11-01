import {
  type DatabaseExecutor,
  projectActivities,
  projectTasks,
  taskDependencies,
} from '@oneohm/database';
import { shiftDependents, slipDays } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { eq, inArray } from 'drizzle-orm';

interface ChangedTask {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
}

/**
 * Moves the open tasks that wait on `task` later, now that it ends on `endsOn` (PRD 3.6):
 * each by the slip, less any slack it had; never earlier. Returns how many moved and by
 * at most how many days.
 */
export async function moveLaterTasks(
  tx: DatabaseExecutor,
  task: ChangedTask,
  endsOn: string,
): Promise<{ moved: number; days: number }> {
  const rows = await tx
    .select({
      id: projectTasks.id,
      startDate: projectTasks.startDate,
      dueDate: projectTasks.dueDate,
      status: projectTasks.status,
      completedAt: projectTasks.completedAt,
    })
    .from(projectTasks)
    .where(eq(projectTasks.projectId, task.projectId));
  const ids = rows.map((row) => row.id);
  const links = ids.length
    ? await tx
        .select({
          taskId: taskDependencies.taskId,
          dependsOnTaskId: taskDependencies.dependsOnTaskId,
        })
        .from(taskDependencies)
        .where(inArray(taskDependencies.taskId, ids))
    : [];
  const planned = rows.map((row) => ({
    id: row.id,
    startDate: row.startDate,
    dueDate: row.dueDate,
    finishedOn:
      row.status === 'completed'
        ? row.completedAt
          ? todayIn('Asia/Kolkata', row.completedAt)
          : row.dueDate
        : null,
  }));
  const shifts = shiftDependents(planned, links, { id: task.id, endsOn });
  const now = new Date();
  for (const shift of shifts) {
    await tx
      .update(projectTasks)
      .set({ startDate: shift.startDate, dueDate: shift.dueDate, updatedAt: now })
      .where(eq(projectTasks.id, shift.id));
  }
  return { moved: shifts.length, days: Math.max(0, ...shifts.map((shift) => shift.days)) };
}

/** "3 later tasks moved up to 2 days later." for the project history. */
function movedLine(moved: number, days: number): string {
  const tasks = moved === 1 ? '1 later task' : `${moved} later tasks`;
  const by = days === 1 ? '1 day' : `${days} days`;
  return moved === 1 ? `${tasks} moved ${by} later.` : `${tasks} moved up to ${by} later.`;
}

/**
 * After a late finish, the work waiting on it moves later by the slip (PRD 3.6), with a
 * line in the project history. On-time work changes nothing.
 */
export async function followLateFinish(
  tx: DatabaseExecutor,
  task: ChangedTask & { readonly dueDate: string },
  finishedAt: Date,
  userId: string,
): Promise<void> {
  const finishedOn = todayIn('Asia/Kolkata', finishedAt);
  const slip = slipDays(task.dueDate, finishedOn);
  if (slip === 0) return;
  const { moved, days } = await moveLaterTasks(tx, task, finishedOn);
  if (moved === 0) return;
  const late = slip === 1 ? '1 day' : `${slip} days`;
  await tx.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'schedule',
    message: `${task.title} finished ${late} late. ${movedLine(moved, days)}`,
    userId,
    data: { slip, moved, days },
    // Listed just after the "completed" line written in the same transaction.
    createdAt: new Date(finishedAt.getTime() + 1),
  });
}

/** The history line for tasks that moved after a manager changed a due date. */
export function followLine(moved: number, days: number): string {
  return moved === 0 ? '' : ` ${movedLine(moved, days)}`;
}
