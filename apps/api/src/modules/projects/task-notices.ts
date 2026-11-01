import { type DatabaseExecutor, notify, notifyHolders, projects } from '@oneohm/database';
import { helpRecipients } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { STAFF_NOTICES } from '../../common/notices';
import { managerOf } from '../people/reporting-line';

interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly assigneeUserId: string | null;
}

async function projectCode(db: DatabaseExecutor, projectId: string): Promise<string> {
  const [row] = await db
    .select({ code: projects.code })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.code ?? '';
}

/** Tells the new assignee, unless they gave the task to themselves. */
export async function tellAssignee(
  db: DatabaseExecutor,
  task: TaskRow,
  userId: string | null,
  actorId: string,
): Promise<void> {
  if (!userId || userId === actorId || userId === task.assigneeUserId) return;
  const code = await projectCode(db, task.projectId);
  await notify(db, { userId }, STAFF_NOTICES.taskAssigned(task, code, `${userId}:${Date.now()}`));
}

/** Everyone who approves tasks hears that one waits for them. */
export async function askApprovers(
  db: DatabaseExecutor,
  task: TaskRow,
  actor: { readonly userId: string; readonly fullName: string },
): Promise<void> {
  await notifyHolders(
    db,
    'tasks.approve',
    STAFF_NOTICES.taskNeedsApproval(task, actor.fullName, String(Date.now())),
    actor.userId,
  );
}

/** The person who did the work hears it was approved. */
export async function tellApproved(
  db: DatabaseExecutor,
  task: TaskRow,
  actorId: string,
): Promise<void> {
  if (!task.assigneeUserId || task.assigneeUserId === actorId) return;
  await notify(db, { userId: task.assigneeUserId }, STAFF_NOTICES.taskApproved(task));
}

/** On a new project, each person hears once how many of its tasks are theirs. */
export async function tellTeam(
  db: DatabaseExecutor,
  projectId: string,
  code: string,
  perPerson: ReadonlyMap<string, number>,
  actorId: string,
): Promise<void> {
  for (const [userId, count] of perPerson) {
    if (userId === actorId) continue;
    await notify(db, { userId }, STAFF_NOTICES.projectTasks(projectId, code, count, userId));
  }
}

/** The people who may review the work hear that it waits for them. */
export async function askReviewers(
  db: DatabaseExecutor,
  task: TaskRow,
  actor: { readonly userId: string; readonly fullName: string },
  reviewers: readonly string[],
): Promise<void> {
  const notice = STAFF_NOTICES.taskNeedsApproval(task, actor.fullName, String(Date.now()));
  for (const userId of reviewers) {
    if (userId === actor.userId) continue;
    await notify(db, { userId }, { ...notice, dedupeKey: `${notice.dedupeKey}:${userId}` });
  }
}

/** Whoever sent the work (or the assignee) hears it came back, and why. */
export async function tellReturned(
  db: DatabaseExecutor,
  task: TaskRow,
  to: string | null,
  actor: { readonly userId: string; readonly fullName: string },
  reason: string,
): Promise<void> {
  if (!to || to === actor.userId) return;
  await notify(
    db,
    { userId: to },
    STAFF_NOTICES.taskReturned(task, actor.fullName, reason, String(Date.now())),
  );
}

/**
 * A request for the team's help reaches the project manager straight away (PRD 4.4), or
 * everyone who manages projects when the project has none, not only after escalation.
 * The asker's own manager hears too, when they have one (PRD 3.12).
 */
export async function tellHelpAsked(
  db: DatabaseExecutor,
  task: TaskRow,
  actor: { readonly userId: string; readonly fullName: string },
): Promise<void> {
  const [project] = await db
    .select({ code: projects.code, managerUserId: projects.managerUserId })
    .from(projects)
    .where(eq(projects.id, task.projectId))
    .limit(1);
  if (!project) return;
  const notice = STAFF_NOTICES.taskHelpAsked(
    task,
    project.code,
    actor.fullName,
    String(Date.now()),
  );
  const manager = await managerOf(db, actor.userId);
  const reach = helpRecipients({
    askerUserId: actor.userId,
    projectManagerUserId: project.managerUserId,
    askerManagerUserId: manager?.active ? manager.id : null,
  });
  for (const userId of reach.userIds)
    await notify(db, { userId }, { ...notice, dedupeKey: `${notice.dedupeKey}:${userId}` });
  if (reach.projectManagers) await notifyHolders(db, 'projects.manage', notice, actor.userId);
}

/** The assignee hears about a new due date someone else set. */
export async function tellRescheduled(
  db: DatabaseExecutor,
  task: TaskRow,
  due: string,
  actorId: string,
): Promise<void> {
  if (!task.assigneeUserId || task.assigneeUserId === actorId) return;
  await notify(
    db,
    { userId: task.assigneeUserId },
    STAFF_NOTICES.taskRescheduled(task, due, String(Date.now())),
  );
}
