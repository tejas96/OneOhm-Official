import { type DatabaseExecutor, projectTasks } from '@oneohm/database';
import { isRatedStage, stageDone } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { askRating } from '../care/rating-ask';

/**
 * Flow G step 1: when the last task of a rated stage (survey, installation, switch-on)
 * finishes and the stage has work the customer sees, ask the customer to rate it. The
 * rating is 5 taps in the WhatsApp chat (the template's button opens them outside 24 hours, else SMS or
 * the app); once per stage, and never after they have rated it.
 * Call it in the task-completion transaction, after the task is marked complete.
 */
export async function askForStageRating(
  db: DatabaseExecutor,
  task: { readonly projectId: string; readonly stage: string },
): Promise<boolean> {
  const { stage } = task;
  if (!isRatedStage(stage)) return false;
  const tasks = await db
    .select({
      stage: projectTasks.stage,
      status: projectTasks.status,
      customerVisible: projectTasks.customerVisible,
    })
    .from(projectTasks)
    .where(eq(projectTasks.projectId, task.projectId));
  if (!stageDone(tasks, stage)) return false;
  if (!tasks.some((row) => row.stage === stage && row.customerVisible)) return false;
  // The five taps on WhatsApp (redesign §13), or the template whose button opens them; once per stage.
  return (await askRating(db, { kind: 'stage', projectId: task.projectId, stage })) === 'sent';
}
