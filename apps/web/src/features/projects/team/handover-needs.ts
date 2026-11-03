import type { ProjectDetail } from '@oneohm/api-contracts';

/** The pick that means "leave their tasks with them". */
export const KEEP = '__keep__';

export interface HandOverNeed {
  readonly id: string;
  readonly fullName: string;
  readonly open: number;
}

/**
 * Who is being taken off the team (on it now, not in `team`) and still holds open
 * tasks or proposals on this project: each needs a choice before saving.
 */
export function handOverNeeds(project: ProjectDetail, team: readonly string[]): HandOverNeed[] {
  return project.setup.team
    .filter((member) => !team.includes(member.id))
    .map((member) => ({
      id: member.id,
      fullName: member.fullName,
      open: project.tasks.filter(
        (task) =>
          task.status !== 'completed' &&
          (task.assignee?.id === member.id || task.proposedAssignee?.id === member.id),
      ).length,
    }))
    .filter((need) => need.open > 0);
}

/** The `handOver` the API takes, once every row has a pick. */
export function handOverBody(
  needs: readonly HandOverNeed[],
  picks: Readonly<Record<string, string>>,
): { fromUserId: string; toUserId: string | null }[] {
  return needs.map((need) => ({
    fromUserId: need.id,
    toUserId: picks[need.id] === KEEP ? null : (picks[need.id] ?? null),
  }));
}
