import { type DatabaseExecutor, projectTasks, taskWaits } from '@oneohm/database';
import { eq } from 'drizzle-orm';

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

/** Work handed in straight from a wait: keep that stretch and close it (spec 3.7). */
export async function closeOpenWait(
  db: DatabaseExecutor,
  task: Pick<typeof projectTasks.$inferSelect, 'id' | 'waitingParty' | 'waitingSince'>,
): Promise<void> {
  if (!task.waitingSince) return;
  await keepFinishedWait(db, task);
  await db.update(projectTasks).set({ waitingSince: null }).where(eq(projectTasks.id, task.id));
}

/**
 * When a wait starts: the same party again keeps the running stretch; a new party keeps
 * the finished one (never overwritten) and starts now.
 */
export async function nextWaitStart(
  db: DatabaseExecutor,
  task: Pick<typeof projectTasks.$inferSelect, 'id' | 'status' | 'waitingParty' | 'waitingSince'>,
  party: (typeof projectTasks.$inferSelect)['waitingParty'],
): Promise<Date> {
  if (task.status !== 'waiting') return new Date();
  if (task.waitingParty === party && task.waitingSince) return task.waitingSince;
  await keepFinishedWait(db, task);
  return new Date();
}
