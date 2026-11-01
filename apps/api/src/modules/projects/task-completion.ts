import {
  paymentMilestones,
  postMilestoneDue,
  projectActivities,
  projects,
  projectTasks,
  type Transaction,
  taskDependencies,
} from '@oneohm/database';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { settleWorkOrderForTask } from '../contractors/work-order-settle';
import { awardOnTimeTask } from '../workforce/points';
import { tellCustomerAbout, tellManagerDone } from './task-messages';

type TaskRow = typeof projectTasks.$inferSelect;

/**
 * What finishing a task sets off, in the same transaction (PRD 3.7, Flow C): unlock the
 * next tasks, make payment milestones due, mark the project operational, tell the
 * customer when the task is configured to, and record it all in the project history.
 */
export async function finishTask(tx: Transaction, task: TaskRow, userId: string): Promise<void> {
  const now = new Date();
  await tx
    .update(projectTasks)
    .set({ status: 'completed', completedAt: now, completedByUserId: userId, updatedAt: now })
    .where(eq(projectTasks.id, task.id));

  const dependents = await tx
    .select({ taskId: taskDependencies.taskId })
    .from(taskDependencies)
    .where(eq(taskDependencies.dependsOnTaskId, task.id));
  for (const { taskId } of dependents) {
    const open = await tx
      .select({ id: projectTasks.id })
      .from(taskDependencies)
      .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.dependsOnTaskId))
      .where(and(eq(taskDependencies.taskId, taskId), ne(projectTasks.status, 'completed')));
    if (open.length === 0) {
      await tx
        .update(projectTasks)
        .set({ status: 'ready', updatedAt: now })
        .where(and(eq(projectTasks.id, taskId), eq(projectTasks.status, 'pending')));
    }
  }

  if (task.onComplete === 'project_operational') {
    await tx
      .update(projects)
      .set({ status: 'operational', operationalAt: now, updatedAt: now })
      .where(eq(projects.id, task.projectId));
  } else if (task.onComplete) {
    // "Not due yet" is an empty due date: an advance may already have part-paid it.
    const due = await tx
      .update(paymentMilestones)
      .set({
        status: sql`case when ${paymentMilestones.status} = 'upcoming' then 'due'::milestone_status else ${paymentMilestones.status} end`,
        dueAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentMilestones.projectId, task.projectId),
          eq(paymentMilestones.trigger, task.onComplete),
          isNull(paymentMilestones.dueAt),
        ),
      )
      .returning({ id: paymentMilestones.id });
    // The receivable is booked in the same transaction (PRD 3.11, Flow D).
    for (const milestone of due) await postMilestoneDue(tx, milestone.id, userId);
  }

  const remaining = await tx
    .select({ id: projectTasks.id })
    .from(projectTasks)
    .where(and(eq(projectTasks.projectId, task.projectId), ne(projectTasks.status, 'completed')));
  if (remaining.length === 0) {
    await tx
      .update(projects)
      .set({ status: 'completed', updatedAt: now })
      .where(eq(projects.id, task.projectId));
  }

  await tellCustomerAbout(tx, task, 'completed');
  await tellManagerDone(tx, task, userId);
  await tx.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'task_completed',
    message: `${task.title} completed.`,
    userId,
  });
  // A contractor's work order settles into a payable once all its tasks are done.
  await settleWorkOrderForTask(tx, task.id, userId);
  // On-time work earns its owner points (PRD 3.12); late work loses nothing.
  await awardOnTimeTask(tx, task);
}

/** Facts a task still needs, after what was sent now and what the project already knows. */
export function missingCaptures(
  captures: readonly string[],
  sent: Readonly<Record<string, string>>,
  known: ReadonlySet<string>,
): string[] {
  return captures.filter((key) => !(sent[key]?.trim() || known.has(key)));
}

export async function projectIdsOf(tx: Transaction, taskIds: readonly string[]): Promise<string[]> {
  if (taskIds.length === 0) return [];
  const rows = await tx
    .select({ projectId: projectTasks.projectId })
    .from(projectTasks)
    .where(inArray(projectTasks.id, [...taskIds]));
  return [...new Set(rows.map((row) => row.projectId))];
}
