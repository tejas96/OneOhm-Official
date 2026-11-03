import type { ProjectDetail } from '@oneohm/api-contracts';

/** The pick that means "leave their tasks with them". */
export const KEEP = '__keep__';

export interface HandOverNeed {
  readonly id: string;
  readonly fullName: string;
  readonly open: number;
}

/**
 * Who is being taken off the team (on it when the sheet opened, `initialTeam`, and not in `team`) and still holds open
 * tasks or proposals on this project: each needs a choice before saving.
 */
export function handOverNeeds(
  project: ProjectDetail,
  initialTeam: readonly string[],
  team: readonly string[],
): HandOverNeed[] {
  return project.setup.team
    .filter((member) => initialTeam.includes(member.id) && !team.includes(member.id))
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

/**
 * The picks that still apply: a pick for someone who no longer needs a hand-over goes, and
 * so does a pick whose target was since taken off the team with open tasks of their own
 * (they now need a hand-over themselves), so Save waits for a new choice.
 */
export function livePicks(
  needs: readonly HandOverNeed[],
  picks: Readonly<Record<string, string>>,
): Record<string, string> {
  const leaving = new Set(needs.map((need) => need.id));
  const live: Record<string, string> = {};
  for (const need of needs) {
    const pick = picks[need.id];
    if (pick && !leaving.has(pick)) live[need.id] = pick;
  }
  return live;
}
