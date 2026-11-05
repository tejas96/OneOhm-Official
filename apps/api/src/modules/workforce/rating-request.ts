import { customerActions, type DatabaseExecutor, projectTasks } from '@oneohm/database';
import { isRatedStage, stageDone } from '@oneohm/domain';
import { and, eq, sql } from 'drizzle-orm';
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
  /** The customer just answered in this chat: the five taps go straight there. */
  chat?: { readonly id: string; readonly phone: string },
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
  // "Is the installation finished?" comes first; its Yes asks for the rating (one question at a time).
  if (!chat && stage === 'installation' && (await installationAsked(db, task.projectId)))
    return false;
  // The five taps on WhatsApp (redesign §13), or the template whose button opens them; once per stage.
  const target = { kind: 'stage', projectId: task.projectId, stage } as const;
  return (await askRating(db, target, chat ? { chat } : {})) === 'sent';
}

/** The installation question is still waiting for the customer's answer. */
async function installationAsked(db: DatabaseExecutor, projectId: string): Promise<boolean> {
  const [open] = await db
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(
      and(
        eq(customerActions.projectId, projectId),
        eq(customerActions.type, 'confirm'),
        eq(customerActions.status, 'open'),
        sql`${customerActions.payload}->>'kind' = 'installation'`,
      ),
    )
    .limit(1);
  return Boolean(open);
}
