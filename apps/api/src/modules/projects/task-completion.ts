import {
  paymentMilestones,
  postMilestoneDue,
  projectActivities,
  projects,
  projectTasks,
  type Transaction,
  taskDependencies,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { recordInstalledAssets } from '../after-sales/installed-assets.record';
import { settleWorkOrderForTask } from '../contractors/work-order-settle';
import { tellCustomerMilestonesDue } from '../online-payments/milestone-due-notice';
import { recordSubsidyClaim } from '../quotations/subsidy-claim';
import { awardTaskPoints } from '../workforce/points';
import { askForStageRating } from '../workforce/rating-request';
import { closeIfSettled } from './financial-closure';
import { tellCustomerAbout, tellManagerDone } from './task-messages';
import { followLateFinish } from './task-schedule';

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
    // The customer hears that a payment is due, with a pay link when online payments are on.
    await tellCustomerMilestonesDue(
      tx,
      due.map((milestone) => milestone.id),
    );
  }

  // Commissioning records the installed system and starts its warranties (PRD 3.17).
  if (task.onComplete === 'commissioning_completed' || task.onComplete === 'project_operational') {
    await recordInstalledAssets(tx, task.projectId, todayIn('Asia/Kolkata', now));
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
    // Usually the money is in before the last task (subsidy release), so close here too.
    await closeIfSettled(tx, task.projectId);
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
  // Late work moves the tasks waiting on it later by the slip (PRD 3.6).
  await followLateFinish(tx, task, now, userId);
  // A contractor's work order settles into a payable once all its tasks are done.
  await settleWorkOrderForTask(tx, task.id, userId);
  // One subsidy per property (PRD 3.5): a released subsidy marks the site.
  await recordSubsidyClaim(tx, task, userId);
  // Fair points for whoever handed it in (spec 3.7); a missed part shows, nothing is lost.
  await awardTaskPoints(tx, task, userId);
  // A finished customer-visible stage asks the customer how it went (PRD Flow G1).
  await askForStageRating(tx, task);
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
