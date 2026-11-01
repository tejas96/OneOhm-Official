import {
  type DatabaseExecutor,
  paymentMilestones,
  projectTasks,
  taskDependencies,
} from '@oneohm/database';
import { blockedReason, type EpcStage, type ProjectBlock } from '@oneohm/domain';
import { type AnyColumn, and, eq, inArray, ne, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { changeRequestsBlocking, openChangeRequestBlocks } from './change-request-blocks';

/** Above this many projects, facts are asked by subquery rather than by a list of ids. */
const LONG_LIST = 40;

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

/** How many tasks a stage of a project has, how many are done, and when the last one finished. */
export interface StageCount {
  readonly projectId: string;
  readonly stage: EpcStage;
  readonly total: number;
  readonly done: number;
  readonly lastDoneAt: Date | null;
}

/**
 * What the cards need, read once for all of them: the OPEN tasks only (a finished
 * project's work is counted, not loaded), each stage's counts, milestones, and what
 * blocks each project.
 */
export async function summaryFacts(
  db: DatabaseExecutor,
  ids: readonly string[],
  today: string,
  /** The same projects as a subquery: asked instead of hundreds of ids in a list. */
  scope?: SQLWrapper,
): Promise<{
  tasks: TaskRow[];
  stages: StageCount[];
  milestones: MilestoneRow[];
  blocked: Map<string, ProjectBlock>;
}> {
  const inProjects = (column: AnyColumn) =>
    scope && ids.length > LONG_LIST ? inArray(column, scope) : inArray(column, [...ids]);
  const [tasks, stages, milestones, blocks] = await Promise.all([
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
      .where(and(inProjects(projectTasks.projectId), ne(projectTasks.status, 'completed'))),
    stageCounts(db, inProjects(projectTasks.projectId)),
    db
      .select({
        projectId: paymentMilestones.projectId,
        status: paymentMilestones.status,
        payer: paymentMilestones.payer,
        dueAt: paymentMilestones.dueAt,
        label: paymentMilestones.label,
      })
      .from(paymentMilestones)
      .where(inProjects(paymentMilestones.projectId)),
    openChangeRequestBlocks(db, ids),
  ]);
  const blocked = await blockedProjects(
    db,
    ids,
    inProjects(projectTasks.projectId),
    tasks,
    blocks,
    today,
  );
  return { tasks, stages, milestones, blocked };
}

function stageCounts(db: DatabaseExecutor, inProjects: SQL): Promise<StageCount[]> {
  return db
    .select({
      projectId: projectTasks.projectId,
      stage: projectTasks.stage,
      total: sql<number>`count(*)::int`,
      done: sql<number>`(count(*) filter (where ${projectTasks.status} = 'completed'))::int`,
      lastDoneAt: sql<Date | null>`max(${projectTasks.completedAt})`.mapWith(
        projectTasks.completedAt,
      ),
    })
    .from(projectTasks)
    .where(inProjects)
    .groupBy(projectTasks.projectId, projectTasks.stage);
}

/**
 * What holds each project back. Only open tasks matter: a prerequisite that is done
 * (and so not loaded) never blocks.
 */
async function blockedProjects(
  db: DatabaseExecutor,
  ids: readonly string[],
  inProjects: SQL,
  open: readonly TaskRow[],
  blocks: Awaited<ReturnType<typeof openChangeRequestBlocks>>,
  today: string,
): Promise<Map<string, ProjectBlock>> {
  // Asked by project rather than by open task (thousands of ids).
  const links = open.length
    ? await db
        .select({ taskId: taskDependencies.taskId, before: taskDependencies.dependsOnTaskId })
        .from(taskDependencies)
        .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.taskId))
        .where(and(inProjects, ne(projectTasks.status, 'completed')))
    : [];
  const dependsOn = new Map<string, string[]>();
  for (const link of links)
    dependsOn.set(link.taskId, [...(dependsOn.get(link.taskId) ?? []), link.before]);
  const byProject = new Map<string, TaskRow[]>();
  for (const task of open)
    byProject.set(task.projectId, [...(byProject.get(task.projectId) ?? []), task]);
  const blocked = new Map<string, ProjectBlock>();
  for (const id of ids) {
    const mine = byProject.get(id) ?? [];
    const changeRequests = new Map(
      mine.map((task) => [task.id, changeRequestsBlocking(blocks.get(id), task)]),
    );
    const reason = blockedReason({ today, tasks: mine, dependsOn, changeRequests });
    if (reason) blocked.set(id, reason);
  }
  return blocked;
}
