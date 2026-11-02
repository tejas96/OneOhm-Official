import { type DatabaseExecutor, projectFacts, projectTasks } from '@oneohm/database';
import { CHECKLIST_TICKED, checklistFor } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { conflict, invalid } from '../../common/http/errors';

type TaskRow = typeof projectTasks.$inferSelect;

/**
 * Saves one checklist tick the moment it is made, so ticks are never lost on a phone and
 * a tick counts as an update (it clears "stale", spec 3.5). A tick is the project fact
 * of the item's key, as completing the task has always saved it.
 */
export async function saveTick(
  tx: DatabaseExecutor,
  task: TaskRow,
  key: string,
  done: boolean,
): Promise<void> {
  if (task.status === 'completed' || task.status === 'in_review')
    throw conflict('This task is with its reviewer or done; its checklist is closed.', 'closed');
  if (!checklistFor(task).some((item) => item.key === key))
    throw invalid('That is not on this task’s checklist.', { key: 'Pick an item from the list.' });
  if (done)
    await tx
      .insert(projectFacts)
      .values({
        projectId: task.projectId,
        key,
        value: CHECKLIST_TICKED,
        capturedByTaskId: task.id,
      })
      .onConflictDoUpdate({
        target: [projectFacts.projectId, projectFacts.key],
        set: { value: CHECKLIST_TICKED, capturedByTaskId: task.id, updatedAt: new Date() },
      });
  else
    await tx
      .delete(projectFacts)
      .where(and(eq(projectFacts.projectId, task.projectId), eq(projectFacts.key, key)));
  await tx.update(projectTasks).set({ updatedAt: new Date() }).where(eq(projectTasks.id, task.id));
}
