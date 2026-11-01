import { type Database, documents, projectTasks, taskDependencies } from '@oneohm/database';
import { missingEvidence } from '@oneohm/domain';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import {
  changeRequestsBlocking,
  openChangeRequestBlocks,
} from '../../common/read-models/change-request-blocks';

/** Earlier tasks and open change requests (PRD 3.15) can both hold a task back. */
export async function assertUnblocked(
  db: Database,
  task: typeof projectTasks.$inferSelect,
): Promise<void> {
  const blockers = await db
    .select({ title: projectTasks.title })
    .from(taskDependencies)
    .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.dependsOnTaskId))
    .where(and(eq(taskDependencies.taskId, task.id), ne(projectTasks.status, 'completed')));
  const changes = changeRequestsBlocking(
    (await openChangeRequestBlocks(db, [task.projectId])).get(task.projectId),
    task,
  );
  const titles = [...blockers.map((blocker) => blocker.title), ...changes];
  if (titles.length > 0) throw conflict(`Waiting for: ${titles.join(', ')}.`, 'blocked');
}

/** PRD 4.4: a task that needs site photos completes only once one is attached. */
export async function assertEvidence(
  db: Database,
  id: string,
  required: readonly string[],
): Promise<void> {
  const attached = await db
    .select({ contentType: documents.contentType })
    .from(documents)
    .where(
      and(eq(documents.taskId, id), isNull(documents.replacedAt), isNull(documents.removedAt)),
    );
  const missing = missingEvidence(
    required,
    attached.map((file) => file.contentType),
  );
  if (missing.includes('photo')) {
    throw conflict('Add at least one site photo before completing this task.', 'evidence_missing');
  }
}
