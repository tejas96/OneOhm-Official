import {
  customerActions,
  type Database,
  notify,
  projectActivities,
  projectTasks,
  taskWaits,
} from '@oneohm/database';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

/** The asks a step can wait on (a rating, a call-back or a UPI ID never holds a step). */
const HOLDING = [
  'paper',
  'location',
  'signature',
  'confirm',
  'self_survey',
  'visit_pick',
  'presence',
  'pay',
] as const;
const PER_TICK = 100;

/**
 * A step waiting on the customer starts again by itself once everything asked of them for that
 * project is done (redesign §2.3): at least one ask closed after the wait began, and none still open
 * or waiting to be checked. Asks made from another step do not count. The owner is told and the
 * log says so; the wait is kept for the averages. Safe to repeat: a step already moved is skipped.
 */
export async function endWaitsOnAnsweredAsks(db: Database, now: Date): Promise<number> {
  const forTask = (task: typeof projectTasks) =>
    and(
      eq(customerActions.projectId, task.projectId),
      or(isNull(customerActions.taskId), eq(customerActions.taskId, task.id)),
      inArray(customerActions.type, [...HOLDING]),
    );
  const ready = await db
    .select({
      id: projectTasks.id,
      projectId: projectTasks.projectId,
      title: projectTasks.title,
      assignee: projectTasks.assigneeUserId,
      since: projectTasks.waitingSince,
      startedAt: projectTasks.startedAt,
    })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.status, 'waiting'),
        eq(projectTasks.waitingParty, 'customer'),
        sql`${projectTasks.waitingSince} is not null`,
        sql`exists (select 1 from ${customerActions} where ${forTask(projectTasks)}
          and ${customerActions.status} = 'closed' and ${customerActions.closedAt} > ${projectTasks.waitingSince})`,
        sql`not exists (select 1 from ${customerActions} where ${forTask(projectTasks)}
          and ${customerActions.status} in ('open', 'received'))`,
      ),
    )
    .limit(PER_TICK);
  let ended = 0;
  for (const task of ready) {
    const since = task.since;
    if (!since) continue;
    const moved = await db.transaction(async (tx) => {
      const rows = await tx
        .update(projectTasks)
        .set({
          status: task.startedAt ? 'in_progress' : 'ready',
          waitingSince: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(projectTasks.id, task.id),
            eq(projectTasks.status, 'waiting'),
            eq(projectTasks.waitingSince, since),
          ),
        )
        .returning({ id: projectTasks.id });
      if (rows.length === 0) return false;
      await tx
        .insert(taskWaits)
        .values({ taskId: task.id, party: 'customer', startedAt: since, endedAt: now });
      await tx.insert(projectActivities).values({
        projectId: task.projectId,
        taskId: task.id,
        kind: 'resumed',
        message: `${task.title}: everything asked from the customer is done, so the step is open again.`,
        userId: null,
      });
      if (task.assignee)
        await notify(
          tx,
          { userId: task.assignee },
          {
            kind: 'task_wait_ended',
            title: `${task.title}: the customer's part is done`,
            body: 'Everything asked from the customer is checked. The step is open again.',
            subject: { type: 'project', id: task.projectId, projectId: task.projectId },
            dedupeKey: `task_wait_ended:${task.id}:${since.toISOString()}`,
          },
        );
      return true;
    });
    if (moved) ended += 1;
  }
  return ended;
}
