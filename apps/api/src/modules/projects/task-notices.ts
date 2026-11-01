import { type DatabaseExecutor, notify, notifyHolders, projects } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { STAFF_NOTICES } from '../../common/notices';

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
