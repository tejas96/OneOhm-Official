import {
  type DatabaseExecutor,
  notify,
  notifyCover,
  notifyHolders,
  projectActivities,
  projects,
  projectTasks,
} from '@oneohm/database';
import { and, eq, ne } from 'drizzle-orm';
import { closeOpenWait, nextWaitStart } from '../projects/task-waits';

/** The task keys the journey steps hang on (the library's keys stay when an owner renames them). */
export const DISPATCH_KEY = 'dispatch_material';
export const INSTALLATION_KEY = 'installation_complete';
export const HANDOVER_KEY = 'handover';

export type JourneyTask = typeof projectTasks.$inferSelect;

export async function taskFor(db: DatabaseExecutor, taskId: string): Promise<JourneyTask | null> {
  const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, taskId)).limit(1);
  return task ?? null;
}

/** The project's task of this kind that is not done yet (what the menu offers from the project page). */
export async function openTaskByKey(
  db: DatabaseExecutor,
  projectId: string,
  key: string,
): Promise<JourneyTask | null> {
  const [task] = await db
    .select()
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.projectId, projectId),
        eq(projectTasks.templateKey, key),
        ne(projectTasks.status, 'completed'),
      ),
    )
    .limit(1);
  return task ?? null;
}

/** Who a task's news goes to: its assignee (their cover when away), else the project manager, else the desk. */
export async function alertTaskOwner(
  tx: DatabaseExecutor,
  task: Pick<JourneyTask, 'id' | 'projectId' | 'assigneeUserId'>,
  notice: { kind: string; title: string; body: string; key: string },
): Promise<void> {
  const [project] = await tx
    .select({ manager: projects.managerUserId })
    .from(projects)
    .where(eq(projects.id, task.projectId));
  const person = task.assigneeUserId ?? project?.manager ?? null;
  const full = {
    kind: notice.kind,
    title: notice.title,
    body: notice.body,
    subject: { type: 'task' as const, id: task.id, projectId: task.projectId },
    dedupeKey: notice.key,
  };
  if (person) await notifyCover(tx, person, 'projects.manage', full);
  else await notifyHolders(tx, 'projects.manage', full);
}

/** The manager of the project is told (the desk when it has none). */
export async function alertManager(
  tx: DatabaseExecutor,
  projectId: string,
  notice: { kind: string; title: string; body: string; key: string },
): Promise<void> {
  const [project] = await tx
    .select({ manager: projects.managerUserId })
    .from(projects)
    .where(eq(projects.id, projectId));
  const full = {
    kind: notice.kind,
    title: notice.title,
    body: notice.body,
    subject: { type: 'project' as const, id: projectId, projectId },
    dedupeKey: notice.key,
  };
  if (project?.manager) await notify(tx, { userId: project.manager }, full);
  else await notifyHolders(tx, 'projects.manage', full);
}

/** The step now waits on the customer: the same wait staff set by hand (kept stretches, log line). */
export async function waitOnCustomer(
  tx: DatabaseExecutor,
  task: JourneyTask,
  note: string,
): Promise<string | null> {
  if (task.status === 'completed') return null;
  const since = await nextWaitStart(tx, task, 'customer');
  await tx
    .update(projectTasks)
    .set({
      status: 'waiting',
      waitingParty: 'customer',
      waitingSince: since,
      updatedAt: new Date(),
    })
    .where(eq(projectTasks.id, task.id));
  await tx.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'waiting',
    message: `${task.title}: waiting on the customer (${note}).`,
    userId: null,
  });
  // The stretch this ask started: only it is ended when the ask ends (a later wait on someone else stays).
  return since.toISOString();
}

/**
 * The wait on the customer ends: the step is ready or running again, as it was before it waited. With
 * `since` (the stretch the ask started) only that very wait ends; any other wait is left alone.
 */
export async function resumeAfterWait(
  tx: DatabaseExecutor,
  task: JourneyTask,
  since?: string | null,
): Promise<void> {
  if (task.status !== 'waiting' || task.waitingParty !== 'customer') return;
  if (since && task.waitingSince?.toISOString() !== since) return;
  await closeOpenWait(tx, task);
  await tx
    .update(projectTasks)
    .set({ status: task.startedAt ? 'in_progress' : 'ready', updatedAt: new Date() })
    .where(eq(projectTasks.id, task.id));
  await tx.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'resumed',
    message: `${task.title}: the customer answered, so the step is open again.`,
    userId: null,
  });
}
