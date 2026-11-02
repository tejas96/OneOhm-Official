import type { ProjectTask } from '@oneohm/api-contracts';
import { daysBetween } from '@oneohm/shared';

type Blocker = ProjectTask['blockers'][number];

interface Dependency {
  readonly title: string;
  readonly status: ProjectTask['status'];
  readonly dueDate: string;
  readonly waitingParty: ProjectTask['waitingParty'];
  readonly assigneeName: string | null;
}

/**
 * An earlier task this one waits for, with who holds it and how late it runs, or the
 * outside party it waits on, so nobody on the team is blamed for a bank's delay.
 */
export function blockerDetails(dep: Dependency, today: string): Blocker {
  const outside = dep.status === 'waiting' && dep.waitingParty !== 'internal';
  return {
    title: dep.title,
    assignee: dep.assigneeName,
    daysLate: Math.max(0, daysBetween(dep.dueDate, today)),
    waitingOn: outside ? dep.waitingParty : null,
  };
}
