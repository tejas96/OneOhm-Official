import {
  customers,
  type DatabaseExecutor,
  projects,
  projectTasks,
  queueCustomerMessage,
  stageRatings,
} from '@oneohm/database';
import { isRatedStage, stageDone } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';

const STAGE_NAME = {
  survey: 'site survey',
  installation: 'installation',
  commissioning: 'switch-on and handover',
} as const;

/**
 * Flow G step 1: when the last task of a rated stage (survey, installation, switch-on)
 * finishes and the stage has work the customer sees, ask the customer to rate it. The
 * message goes the way that reaches them (WhatsApp, else SMS, else handed over in
 * person) and into their app; once per stage, and never after they have rated it.
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
  const [rated] = await db
    .select({ id: stageRatings.id })
    .from(stageRatings)
    .where(and(eq(stageRatings.projectId, task.projectId), eq(stageRatings.stage, stage)))
    .limit(1);
  if (rated) return false;
  const [project] = await db
    .select({ code: projects.code, name: customers.name, phone: customers.phoneE164 })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(eq(projects.id, task.projectId))
    .limit(1);
  if (!project?.phone) return false;
  return queueCustomerMessage(
    db,
    project.phone,
    'stage_rating_request',
    {
      customer: project.name,
      stage: STAGE_NAME[stage],
      stageKey: stage,
      project: project.code,
    },
    `stage_rating_request:${task.projectId}:${stage}`,
  );
}
