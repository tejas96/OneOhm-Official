import type { ProjectTask } from '@oneohm/api-contracts';
import { type DatabaseExecutor, projectTasks, taskDependencies, users } from '@oneohm/database';
import { eq, inArray } from 'drizzle-orm';

interface Dependent {
  readonly dependsOnTaskId: string;
  readonly title: string;
  readonly status: ProjectTask['status'];
}

/** Titles of the open tasks that wait for this one; none once it is done. */
export function blockingTitles(
  taskId: string,
  taskDone: boolean,
  dependents: readonly Dependent[],
): string[] {
  if (taskDone) return [];
  return dependents
    .filter((dep) => dep.dependsOnTaskId === taskId && dep.status !== 'completed')
    .map((dep) => dep.title);
}

/**
 * Both directions of the task links for a set of tasks: what each waits for (with who
 * holds it and when it is due) and what waits for each (with its priority).
 */
export async function loadTaskLinks(db: DatabaseExecutor, ids: readonly string[]) {
  if (ids.length === 0) return { deps: [], dependents: [] };
  const deps = await db
    .select({
      taskId: taskDependencies.taskId,
      title: projectTasks.title,
      status: projectTasks.status,
      dueDate: projectTasks.dueDate,
      waitingParty: projectTasks.waitingParty,
      assigneeName: users.fullName,
    })
    .from(taskDependencies)
    .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.dependsOnTaskId))
    .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .where(inArray(taskDependencies.taskId, [...ids]));
  const dependents = await db
    .select({
      dependsOnTaskId: taskDependencies.dependsOnTaskId,
      title: projectTasks.title,
      status: projectTasks.status,
      priority: projectTasks.priority,
    })
    .from(taskDependencies)
    .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.taskId))
    .where(inArray(taskDependencies.dependsOnTaskId, [...ids]));
  return { deps, dependents };
}
