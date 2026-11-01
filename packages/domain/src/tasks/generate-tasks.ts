import { addDays } from '@oneohm/shared';
import { appliesTo, type ProjectFacts, type TaskTemplate } from './task-template';

export interface GeneratedTask extends TaskTemplate {
  readonly startDate: string;
  readonly dueDate: string;
}

/**
 * The project's task list from the library: only the tasks whose conditions hold,
 * dependencies on tasks that do not apply dropped, and dates that follow the chain
 * (a task starts after everything it waits for). Library order must list a task
 * after the tasks it depends on.
 */
export function generateTasks(
  library: readonly TaskTemplate[],
  facts: ProjectFacts,
  projectStart: string,
): readonly GeneratedTask[] {
  const included = library.filter((template) => appliesTo(template.when, facts));
  const keys = new Set(included.map((template) => template.key));
  const due = new Map<string, string>();
  return included.map((template) => {
    const dependsOn = template.dependsOn.filter((key) => keys.has(key));
    let startDate = addDays(projectStart, template.offsetDays);
    for (const key of dependsOn) {
      const dependencyDue = due.get(key);
      if (!dependencyDue)
        throw new Error(`Task "${template.key}" depends on "${key}", listed after it.`);
      if (dependencyDue > startDate) startDate = dependencyDue;
    }
    const dueDate = addDays(startDate, template.durationDays);
    due.set(template.key, dueDate);
    return { ...template, dependsOn, startDate, dueDate };
  });
}

export interface AssigneeCandidate {
  readonly userId: string;
  readonly roleKeys: readonly string[];
  readonly openTasks: number;
  readonly onLeave: boolean;
}

/** The least-loaded person in the role who is not on leave; null leaves the task unassigned. */
export function pickAssignee(
  candidates: readonly AssigneeCandidate[],
  roleKey: string,
): AssigneeCandidate | null {
  const eligible = candidates
    .filter((candidate) => candidate.roleKeys.includes(roleKey) && !candidate.onLeave)
    .sort(
      (left, right) => left.openTasks - right.openTasks || left.userId.localeCompare(right.userId),
    );
  return eligible[0] ?? null;
}
