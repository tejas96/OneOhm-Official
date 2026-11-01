import { type Database, documents, projectTasks, taskDependencies } from '@oneohm/database';
import { type EvidenceKind, factLabel, missingEvidence, missingMeasurements } from '@oneohm/domain';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { conflict, invalid } from '../../common/http/errors';
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

const NEEDED: Readonly<Record<EvidenceKind, string>> = {
  photo: 'add at least one site photo',
  document: 'attach the document',
  measurement: 'record the measurements',
  checklist: 'tick every item on the checklist',
  signature: 'get the customer’s signature',
};

/** "add a photo and tick the checklist" for one or more missing kinds. */
function needs(kinds: readonly EvidenceKind[]): string {
  const parts = kinds.map((kind) => NEEDED[kind]);
  const last = parts.pop() ?? '';
  return parts.length > 0 ? `${parts.join(', ')} and ${last}` : last;
}

/**
 * PRD 4.4: a task completes only once its evidence is in. Photos, documents and the
 * customer's signature must be uploaded to the task; checklist ticks and measurements
 * are facts, counted from what the project knows plus what is sent now.
 */
export async function assertEvidence(
  db: Database,
  task: typeof projectTasks.$inferSelect,
  sent: Readonly<Record<string, string>>,
  known: ReadonlySet<string>,
): Promise<void> {
  if (task.evidence.length === 0) return;
  const attached = await db
    .select({ contentType: documents.contentType, category: documents.category })
    .from(documents)
    .where(
      and(eq(documents.taskId, task.id), isNull(documents.replacedAt), isNull(documents.removedAt)),
    );
  const recorded = new Set(known);
  for (const [key, value] of Object.entries(sent)) if (value.trim()) recorded.add(key);
  const missing = missingEvidence(task, attached, recorded);
  if (missing.length === 0) return;
  if (missing.length === 1 && missing[0] === 'measurement') {
    throw invalid(
      'Record the measurements before completing this task.',
      Object.fromEntries(
        missingMeasurements(task, recorded).map((key) => [key, `${factLabel(key)} is required.`]),
      ),
    );
  }
  throw conflict(`Before completing this task, ${needs(missing)}.`, 'evidence_missing');
}
