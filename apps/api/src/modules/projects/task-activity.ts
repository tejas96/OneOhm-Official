import type { TaskActivity } from '@oneohm/api-contracts';
import { type DatabaseExecutor, projectActivities, projectTasks, users } from '@oneohm/database';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';

/** How much history a task screen shows. */
export const TIMELINE_ENTRIES = 10;

/**
 * The project's latest history for a task screen (PRD 4.2): staff see the whole project,
 * partner crews only the lines about their own tasks there.
 */
export async function taskTimeline(
  db: DatabaseExecutor,
  actor: Pick<Actor, 'userId' | 'kind'>,
  task: { readonly projectId: string },
): Promise<TaskActivity[]> {
  let own: string[] | null = null;
  if (actor.kind === 'partner') {
    const rows = await db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.projectId, task.projectId),
          eq(projectTasks.assigneeUserId, actor.userId),
        ),
      );
    own = rows.map((row) => row.id);
    if (own.length === 0) return [];
  }
  const rows = await db
    .select({
      id: projectActivities.id,
      kind: projectActivities.kind,
      message: projectActivities.message,
      taskId: projectActivities.taskId,
      userId: projectActivities.userId,
      userName: users.fullName,
      createdAt: projectActivities.createdAt,
    })
    .from(projectActivities)
    .leftJoin(users, eq(users.id, projectActivities.userId))
    .where(
      and(
        eq(projectActivities.projectId, task.projectId),
        own ? inArray(projectActivities.taskId, own) : undefined,
      ),
    )
    .orderBy(desc(projectActivities.createdAt))
    .limit(TIMELINE_ENTRIES);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    message: row.message,
    taskId: row.taskId,
    user: row.userId && row.userName ? { id: row.userId, fullName: row.userName } : null,
    createdAt: row.createdAt.toISOString(),
  }));
}
