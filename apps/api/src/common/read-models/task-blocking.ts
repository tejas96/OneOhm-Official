import type { ProjectTask } from '@oneohm/api-contracts';

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
