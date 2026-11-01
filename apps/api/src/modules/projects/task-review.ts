import {
  type DatabaseExecutor,
  holdersOf,
  projectActivities,
  projects,
  projectTasks,
  type Transaction,
  taskReviews,
} from '@oneohm/database';
import { type ReviewPeople, reviewersOf, reviewRoute, type TaskReviewer } from '@oneohm/domain';
import { and, desc, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { forbidden } from '../../common/http/errors';
import { finishTask } from './task-completion';
import { askReviewers } from './task-notices';

type TaskRow = typeof projectTasks.$inferSelect;

async function reviewPeople(db: DatabaseExecutor, task: TaskRow): Promise<ReviewPeople> {
  const [project] = await db
    .select({ managerUserId: projects.managerUserId })
    .from(projects)
    .where(eq(projects.id, task.projectId))
    .limit(1);
  return {
    reviewer: (task.reviewer === 'project_manager'
      ? 'project_manager'
      : 'approvers') as TaskReviewer,
    managerUserId: project?.managerUserId ?? null,
    approvers: await holdersOf(db, 'tasks.approve'),
  };
}

/**
 * Finished work on an approval task goes to its reviewer (PRD 3.7). Nobody signs off their
 * own work while someone else can; when the doer is the only possible approver, it
 * finishes and the audit marks it as self-approved. Returns true once the task is done.
 */
export async function sendForReview(
  tx: Transaction,
  task: TaskRow,
  actor: Actor,
): Promise<boolean> {
  const route = reviewRoute(await reviewPeople(tx, task), actor.userId);
  if (route.kind === 'self') {
    const now = new Date();
    await tx.insert(taskReviews).values({
      taskId: task.id,
      submittedByUserId: actor.userId,
      outcome: 'self_approved',
      decidedByUserId: actor.userId,
      decidedAt: now,
    });
    await tx
      .update(projectTasks)
      .set({ approvedByUserId: actor.userId })
      .where(eq(projectTasks.id, task.id));
    await recordAudit(tx, actor.userId, 'task.self_approved', 'task', task.id, {
      reason: 'only_approver',
    });
    await finishTask(tx, task, actor.userId);
    return true;
  }
  await tx
    .update(projectTasks)
    .set({ status: 'in_review', updatedAt: new Date() })
    .where(eq(projectTasks.id, task.id));
  await tx.insert(taskReviews).values({ taskId: task.id, submittedByUserId: actor.userId });
  await tx.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'review',
    message: `${task.title} sent for approval.`,
    userId: actor.userId,
  });
  await askReviewers(tx, task, actor, route.reviewers);
  return false;
}

/** The open review for a task: who sent it, if it was recorded. */
async function pendingReview(db: DatabaseExecutor, taskId: string) {
  const [row] = await db
    .select({ id: taskReviews.id, submittedBy: taskReviews.submittedByUserId })
    .from(taskReviews)
    .where(and(eq(taskReviews.taskId, taskId), eq(taskReviews.outcome, 'pending')))
    .orderBy(desc(taskReviews.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Only the task's reviewers may approve or send back work in review: the project manager
 * when the template names them, otherwise anyone with tasks.approve, and never the person
 * who sent it while someone else can. Returns who sent it.
 */
export async function assertMayReview(
  db: DatabaseExecutor,
  task: TaskRow,
  actor: Actor,
): Promise<string | null> {
  const submittedBy = (await pendingReview(db, task.id))?.submittedBy ?? null;
  const reviewers = reviewersOf(await reviewPeople(db, task), submittedBy);
  if (reviewers.includes(actor.userId)) return submittedBy;
  if (submittedBy === actor.userId)
    throw forbidden('Someone else approves your own work. It is waiting with them.');
  throw forbidden(
    task.reviewer === 'project_manager'
      ? 'Only the project manager reviews this task.'
      : 'Only people who approve tasks can review this one.',
  );
}

/** Closes the open review as approved or returned (work sent before reviews were kept gets a row). */
export async function closeReview(
  tx: DatabaseExecutor,
  taskId: string,
  outcome: 'approved' | 'returned',
  actorId: string,
  note: string | null = null,
): Promise<void> {
  const decided = { outcome, decidedByUserId: actorId, decidedAt: new Date(), note };
  const open = await pendingReview(tx, taskId);
  if (open) {
    await tx.update(taskReviews).set(decided).where(eq(taskReviews.id, open.id));
    return;
  }
  await tx.insert(taskReviews).values({ taskId, ...decided });
}
