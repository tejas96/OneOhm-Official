import { HttpException, Logger } from '@nestjs/common';
import { type DatabaseExecutor, projectActivities } from '@oneohm/database';
import type { Actor } from '../../common/auth/actor';

const log = new Logger('TaskVisitStart');

/** What a check-in needs of the tasks service: the worker's own Start. */
export interface StartsTasks {
  start(actor: Actor, id: string, auto?: { at: Date }): Promise<unknown>;
}

/**
 * A site check-in starts a task that is not started yet (Duty Day step 3), through the same
 * `start` as the worker's own, and says in the task's history that the check-in did it. A task
 * already going, waiting, in review or done is left as it is; a blocked one stays blocked, and
 * the check-in stands either way.
 */
export async function startOnVisit(
  db: DatabaseExecutor,
  actor: Actor,
  task: {
    readonly id: string;
    readonly title: string;
    readonly projectId: string;
    readonly status: string;
  },
  tasks: StartsTasks,
  automatic: boolean,
  at: Date,
): Promise<void> {
  if (['in_progress', 'completed', 'waiting', 'in_review'].includes(task.status)) return;
  try {
    // An automatic start says nothing to the customer and counts from the check-in time.
    await tasks.start(actor, task.id, automatic ? { at } : undefined);
  } catch (error) {
    if (!(error instanceof HttpException))
      log.warn(`Task ${task.id} did not start with its visit: ${String(error)}`);
    return;
  }
  await db.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'task_started',
    message: `${task.title} started${automatic ? ' automatically' : ''} when ${actor.fullName} checked in at the site.`,
    userId: actor.userId,
    data: { automatic },
  });
}
