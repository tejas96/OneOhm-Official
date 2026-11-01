import {
  type DatabaseExecutor,
  paymentMilestones,
  projectTasks,
  taskDependencies,
} from '@oneohm/database';
import { blockedReason, type ProjectBlock } from '@oneohm/domain';
import { inArray } from 'drizzle-orm';
import { changeRequestsBlocking, openChangeRequestBlocks } from './change-request-blocks';

export type TaskRow = Pick<
  typeof projectTasks.$inferSelect,
  | 'id'
  | 'projectId'
  | 'templateKey'
  | 'status'
  | 'stage'
  | 'dueDate'
  | 'waitingParty'
  | 'waitingSince'
  | 'title'
  | 'customerVisible'
  | 'completedAt'
>;
export type MilestoneRow = Pick<
  typeof paymentMilestones.$inferSelect,
  'projectId' | 'status' | 'dueAt' | 'label' | 'payer'
>;

/** Tasks, milestones and what blocks each project, read once for all the cards. */
export async function summaryFacts(
  db: DatabaseExecutor,
  ids: readonly string[],
  today: string,
): Promise<{
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  blocked: Map<string, ProjectBlock>;
}> {
  const [tasks, milestones, blocks] = await Promise.all([
    db
      .select({
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        templateKey: projectTasks.templateKey,
        status: projectTasks.status,
        stage: projectTasks.stage,
        dueDate: projectTasks.dueDate,
        waitingParty: projectTasks.waitingParty,
        waitingSince: projectTasks.waitingSince,
        title: projectTasks.title,
        customerVisible: projectTasks.customerVisible,
        completedAt: projectTasks.completedAt,
      })
      .from(projectTasks)
      .where(inArray(projectTasks.projectId, [...ids])),
    db
      .select({
        projectId: paymentMilestones.projectId,
        status: paymentMilestones.status,
        payer: paymentMilestones.payer,
        dueAt: paymentMilestones.dueAt,
        label: paymentMilestones.label,
      })
      .from(paymentMilestones)
      .where(inArray(paymentMilestones.projectId, [...ids])),
    openChangeRequestBlocks(db, ids),
  ]);
  const openIds = tasks.filter((task) => task.status !== 'completed').map((task) => task.id);
  const links = openIds.length
    ? await db
        .select({ taskId: taskDependencies.taskId, before: taskDependencies.dependsOnTaskId })
        .from(taskDependencies)
        .where(inArray(taskDependencies.taskId, openIds))
    : [];
  const dependsOn = new Map<string, string[]>();
  for (const link of links)
    dependsOn.set(link.taskId, [...(dependsOn.get(link.taskId) ?? []), link.before]);
  const blocked = new Map<string, ProjectBlock>();
  for (const id of ids) {
    const mine = tasks.filter((task) => task.projectId === id);
    const changeRequests = new Map(
      mine.map((task) => [task.id, changeRequestsBlocking(blocks.get(id), task)]),
    );
    const reason = blockedReason({ today, tasks: mine, dependsOn, changeRequests });
    if (reason) blocked.set(id, reason);
  }
  return { tasks, milestones, blocked };
}
