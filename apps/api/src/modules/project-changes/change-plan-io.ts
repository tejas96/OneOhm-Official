import {
  type DatabaseExecutor,
  discoms,
  type projects,
  projectTasks,
  type Transaction,
  taskDependencies,
} from '@oneohm/database';
import {
  type ExistingTask,
  type GeneratedTask,
  type ProjectFacts,
  readinessAfter,
  type ScopeFlags,
  type TaskPlan,
  type TaskPlanInput,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { syncWorkOrders } from '../contractors/work-order-sync';
import { writeGeneratedTasks } from '../projects/project-setup';
import { loadAssigneeCandidates, loadTaskLibrary } from '../projects/task-library.loader';
import { tellTeam } from '../projects/task-notices';
import { projectPool } from './change-pool';

type ProjectRow = typeof projects.$inferSelect;

const finishedOn = (row: { status: string; completedAt: Date | null; dueDate: string }) =>
  row.status !== 'completed'
    ? null
    : row.completedAt
      ? todayIn('Asia/Kolkata', row.completedAt)
      : row.dueDate;

async function projectFacts(db: DatabaseExecutor, project: ProjectRow): Promise<ProjectFacts> {
  const [discom] = await db
    .select({ code: discoms.code })
    .from(discoms)
    .where(eq(discoms.id, project.discomId));
  return {
    projectType: project.type,
    discomCode: discom?.code ?? '',
    loan: project.loan,
    battery: project.battery,
    groundMount: project.groundMount,
    subsidy: project.subsidy,
    nameChange: project.nameChange,
  };
}

async function linksOf(db: DatabaseExecutor, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .where(inArray(taskDependencies.taskId, [...ids]));
}

/** The project's tasks and conditions now, and the conditions the change leads to. */
export async function loadPlanInput(
  db: DatabaseExecutor,
  project: ProjectRow,
  after: ScopeFlags,
): Promise<TaskPlanInput> {
  const rows = await db.select().from(projectTasks).where(eq(projectTasks.projectId, project.id));
  const tasks: ExistingTask[] = rows.map((row) => ({
    id: row.id,
    key: row.templateKey,
    title: row.title,
    status: row.status,
    startedAt: row.startedAt?.toISOString() ?? null,
    startDate: row.startDate,
    dueDate: row.dueDate,
    finishedOn: finishedOn(row),
  }));
  const before = await projectFacts(db, project);
  return {
    library: await loadTaskLibrary(db),
    before,
    after: { ...before, ...after },
    tasks,
    links: await linksOf(
      db,
      rows.map((row) => row.id),
    ),
    today: todayIn(),
  };
}

/** Added tasks get people like new projects do: the project's team and contractor first. */
async function addTasks(
  tx: Transaction,
  project: ProjectRow,
  input: TaskPlanInput,
  plan: TaskPlan,
  userId: string,
): Promise<void> {
  if (plan.added.length === 0) return;
  const generated: GeneratedTask[] = plan.added.flatMap((added) => {
    const template = input.library.find((row) => row.key === added.key);
    return template ? [{ ...template, ...added, dependsOn: [...added.dependsOn] }] : [];
  });
  const candidates = await loadAssigneeCandidates(tx);
  const pool = await projectPool(tx, project.id, candidates);
  const { perPerson } = await writeGeneratedTasks(tx, project.id, generated, candidates, pool);
  const fresh = await tx
    .select({ id: projectTasks.id, key: projectTasks.templateKey })
    .from(projectTasks)
    .where(eq(projectTasks.projectId, project.id));
  const idOf = new Map(fresh.map((row) => [row.key, row.id]));
  // Added tasks go after the rest; links to tasks already on the project are added here.
  await tx
    .update(projectTasks)
    .set({ position: sql`${projectTasks.position} + ${input.tasks.length}` })
    .where(
      and(
        eq(projectTasks.projectId, project.id),
        inArray(
          projectTasks.templateKey,
          generated.map((task) => task.key),
        ),
      ),
    );
  const links = plan.added.flatMap((added) => {
    const id = idOf.get(added.key);
    if (!id) return [];
    const waitsOn = added.dependsOn
      .filter((key) => !plan.added.some((other) => other.key === key))
      .flatMap((key) =>
        idOf.get(key) ? [{ taskId: id, dependsOnTaskId: idOf.get(key) as string }] : [],
      );
    const waitedBy = added.dependentIds.map((taskId) => ({ taskId, dependsOnTaskId: id }));
    return [...waitsOn, ...waitedBy];
  });
  if (links.length > 0) await tx.insert(taskDependencies).values(links).onConflictDoNothing();
  await tellTeam(tx, project.id, project.code, perPerson, userId);
}

/**
 * Writes the plan (PRD 3.6, 3.7): untouched tasks no longer needed come off, new ones are
 * added and assigned, waiting tasks move later, ready/pending follow what each waits for,
 * and the contractor's work order follows its tasks.
 */
export async function applyTaskPlan(
  tx: Transaction,
  project: ProjectRow,
  input: TaskPlanInput,
  plan: TaskPlan,
  userId: string,
): Promise<void> {
  if (plan.removed.length > 0)
    await tx.delete(projectTasks).where(
      inArray(
        projectTasks.id,
        plan.removed.map((task) => task.id),
      ),
    );
  await addTasks(tx, project, input, plan, userId);
  const now = new Date();
  for (const shift of plan.shifts)
    await tx
      .update(projectTasks)
      .set({ startDate: shift.startDate, dueDate: shift.dueDate, updatedAt: now })
      .where(eq(projectTasks.id, shift.id));
  const rows = await tx
    .select({ id: projectTasks.id, status: projectTasks.status })
    .from(projectTasks)
    .where(eq(projectTasks.projectId, project.id));
  const links = await linksOf(
    tx,
    rows.map((row) => row.id),
  );
  for (const change of readinessAfter(rows, links))
    await tx
      .update(projectTasks)
      .set({ status: change.status, updatedAt: now })
      .where(eq(projectTasks.id, change.id));
  await syncWorkOrders(tx, project.id, userId);
}
