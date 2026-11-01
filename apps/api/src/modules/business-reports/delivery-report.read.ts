import { type DatabaseExecutor, projects, projectTasks, users } from '@oneohm/database';
import type { EpcStage } from '@oneohm/domain';
import { daysBetween } from '@oneohm/shared';
import { eq, inArray } from 'drizzle-orm';
import { indiaDate, type ReportScope } from './report-scope';

export interface ProjectFact {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly manager: string | null;
  readonly status: string;
  readonly stage: EpcStage;
  readonly capacityWp: number;
  readonly startDate: string;
  readonly operationalAt: Date | null;
}

export interface TaskFact {
  readonly projectId: string;
  readonly stage: EpcStage;
  readonly dueDate: string;
  /** India date it was finished; null while open. */
  readonly finishedOn: string | null;
}

/** The projects in view (not cancelled, narrowed by manager and type) and all their tasks. */
export async function readDelivery(
  db: DatabaseExecutor,
  scope: ReportScope,
): Promise<{ projects: ProjectFact[]; tasks: TaskFact[] }> {
  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      manager: users.fullName,
      status: projects.status,
      stage: projects.currentStage,
      capacityWp: projects.capacityWp,
      startDate: projects.startDate,
      operationalAt: projects.operationalAt,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.managerUserId))
    .where(scope.projects);
  if (rows.length === 0) return { projects: [], tasks: [] };
  const tasks = await db
    .select({
      projectId: projectTasks.projectId,
      stage: projectTasks.stage,
      dueDate: projectTasks.dueDate,
      completedAt: projectTasks.completedAt,
    })
    .from(projectTasks)
    .where(
      inArray(
        projectTasks.projectId,
        rows.map((row) => row.id),
      ),
    );
  return {
    projects: rows,
    tasks: tasks.map((task) => ({
      projectId: task.projectId,
      stage: task.stage,
      dueDate: task.dueDate,
      finishedOn: task.completedAt ? indiaDate(task.completedAt) : null,
    })),
  };
}

/** Days after the due date a task was finished (0 when on time). */
export const daysLate = (task: TaskFact): number =>
  task.finishedOn ? Math.max(0, daysBetween(task.dueDate, task.finishedOn)) : 0;

/** Finished inside the range. */
export const finishedIn = (task: TaskFact, range: { start: string; end: string }): boolean =>
  task.finishedOn !== null && task.finishedOn >= range.start && task.finishedOn <= range.end;

/** Still open and its due date has passed. */
export const openOverdue = (task: TaskFact, today: string): boolean =>
  task.finishedOn === null && task.dueDate < today;
