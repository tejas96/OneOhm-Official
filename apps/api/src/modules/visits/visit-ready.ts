import { type DatabaseExecutor, projectTasks, taskDependencies } from '@oneohm/database';
import { isPresenceKind, type VisitKind } from '@oneohm/domain';
import { and, eq, ne } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';

/** The titles of the earlier tasks of a task that are not completed yet. */
export async function unfinishedBefore(db: DatabaseExecutor, taskId: string): Promise<string[]> {
  const rows = await db
    .select({ title: projectTasks.title })
    .from(taskDependencies)
    .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.dependsOnTaskId))
    .where(and(eq(taskDependencies.taskId, taskId), ne(projectTasks.status, 'completed')));
  return rows.map((row) => row.title);
}

/**
 * A DISCOM inspection or net-meter date is told to the customer the moment it is saved, so it is
 * not saved for a task that cannot start: while an earlier task is open the date would only be a
 * plan, and the customer would be asked to stay home for nothing. Other visits may be booked
 * ahead (the customer picks a day for an installation long before it starts).
 */
export function assertReadyForDate(kind: VisitKind, waitingFor: readonly string[]): void {
  if (!isPresenceKind(kind) || waitingFor.length === 0) return;
  throw conflict(
    `Not yet: waiting for ${waitingFor.join(', ')}. Tell the customer the DISCOM date once these are done.`,
    'blocked',
  );
}
