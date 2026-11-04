import { invalid } from '../../common/http/errors';

interface Ordered {
  readonly key: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
}

/**
 * The first task listed above a task it waits for, or null. New projects are built in
 * list order, so such a list would stop every new project from being created.
 */
export function firstOutOfOrder(
  list: readonly Ordered[],
): { task: string; waitsFor: string } | null {
  const position = new Map(list.map((template, index) => [template.key, index]));
  for (const [index, template] of list.entries()) {
    for (const key of template.dependsOn) {
      const at = position.get(key);
      if (at !== undefined && at > index)
        return { task: template.title, waitsFor: list[at]?.title ?? key };
    }
  }
  return null;
}

/** Refuses a task order that would break new projects, naming the pair to fix. */
export function assertInOrder(list: readonly Ordered[]): void {
  const problem = firstOutOfOrder(list);
  if (problem)
    throw invalid(
      `"${problem.task}" waits for "${problem.waitsFor}", so it must come after it in the list.`,
      { dependsOn: 'A task must be listed after the tasks it waits for.' },
    );
}
