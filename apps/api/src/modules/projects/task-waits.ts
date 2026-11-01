import { type DatabaseExecutor, type projectTasks, taskWaits } from '@oneohm/database';

/**
 * Keeps a task's finished wait when it is resumed (PRD 3.16), so DISCOM averages count
 * every stretch of waiting, not only the last one.
 */
export async function keepFinishedWait(
  db: DatabaseExecutor,
  task: Pick<typeof projectTasks.$inferSelect, 'id' | 'waitingParty' | 'waitingSince'>,
): Promise<void> {
  if (!task.waitingSince) return;
  await db.insert(taskWaits).values({
    taskId: task.id,
    party: task.waitingParty,
    startedAt: task.waitingSince,
    endedAt: new Date(),
  });
}
