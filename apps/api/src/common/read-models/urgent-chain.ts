import { type DatabaseExecutor, projectTasks, taskDependencies } from '@oneohm/database';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/**
 * Every task that holds up an Urgent one, directly or further down the chain (spec 3.3):
 * if C is Urgent, waits for B, and B waits for A, both B and A are lifted.
 * `edges` are [task, the task it waits for].
 */
export function holdingUpUrgent(
  edges: readonly (readonly [string, string])[],
  urgent: ReadonlySet<string>,
): Set<string> {
  const waitsFor = new Map<string, string[]>();
  for (const [task, before] of edges) waitsFor.set(task, [...(waitsFor.get(task) ?? []), before]);
  const lifted = new Set<string>();
  const queue = [...urgent];
  while (queue.length > 0) {
    const task = queue.pop() as string;
    for (const before of waitsFor.get(task) ?? []) {
      if (lifted.has(before)) continue;
      lifted.add(before);
      queue.push(before);
    }
  }
  return lifted;
}

/** The lifted tasks across these projects, from their open tasks and links. */
export async function urgentChain(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const task = alias(projectTasks, 'task');
  const before = alias(projectTasks, 'before');
  const [edges, urgent] = await Promise.all([
    db
      .select({ task: taskDependencies.taskId, before: taskDependencies.dependsOnTaskId })
      .from(taskDependencies)
      .innerJoin(task, eq(task.id, taskDependencies.taskId))
      .innerJoin(before, eq(before.id, taskDependencies.dependsOnTaskId))
      .where(
        and(
          inArray(task.projectId, [...projectIds]),
          ne(task.status, 'completed'),
          ne(before.status, 'completed'),
        ),
      ),
    db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(
        and(
          inArray(projectTasks.projectId, [...projectIds]),
          eq(projectTasks.priority, 'urgent'),
          ne(projectTasks.status, 'completed'),
        ),
      ),
  ]);
  return holdingUpUrgent(
    edges.map((edge) => [edge.task, edge.before] as const),
    new Set(urgent.map((row) => row.id)),
  );
}
