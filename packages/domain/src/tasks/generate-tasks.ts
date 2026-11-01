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
  /** Skill keys the person holds (PRD 3.7). */
  readonly skills?: readonly string[];
  readonly openTasks: number;
  /** Marked unavailable by hand (for example a long absence). */
  readonly onLeave: boolean;
  /** Approved leave, as inclusive `YYYY-MM-DD` ranges. */
  readonly away?: readonly { readonly from: string; readonly to: string }[];
}

/** True when any approved leave touches the days the task runs. */
export function awayDuring(
  candidate: AssigneeCandidate,
  when: { readonly from: string; readonly to: string },
): boolean {
  return (candidate.away ?? []).some((leave) => leave.from <= when.to && leave.to >= when.from);
}

/**
 * The least-loaded person in the role who is available; null leaves the task unassigned.
 * With `when`, people on approved leave during those days are skipped (PRD 3.8, Flow E).
 * With `skillKey`, people in the role who hold the skill come first; when nobody free
 * has it, the task still goes to the role so it never waits unassigned (PRD 3.7).
 */
export function pickAssignee(
  candidates: readonly AssigneeCandidate[],
  roleKey: string,
  when?: { readonly from: string; readonly to: string },
  skillKey?: string | null,
): AssigneeCandidate | null {
  const eligible = candidates
    .filter(
      (candidate) =>
        candidate.roleKeys.includes(roleKey) &&
        !candidate.onLeave &&
        !(when && awayDuring(candidate, when)),
    )
    .sort(
      (left, right) => left.openTasks - right.openTasks || left.userId.localeCompare(right.userId),
    );
  if (skillKey) {
    const skilled = eligible.find((candidate) => candidate.skills?.includes(skillKey));
    if (skilled) return skilled;
  }
  return eligible[0] ?? null;
}
