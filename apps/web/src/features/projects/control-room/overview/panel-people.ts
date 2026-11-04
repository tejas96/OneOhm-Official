import type { ProjectDetail } from '@oneohm/api-contracts';

export interface PanelPerson {
  readonly id: string;
  readonly name: string;
  readonly open: number;
  readonly done: number;
  /** On the named team but no longer active staff. */
  readonly inactive: boolean;
}

export interface PanelPeople {
  readonly manager: PanelPerson | null;
  /** The named team, with or without tasks. */
  readonly team: PanelPerson[];
  /** Everyone else holding open work on the project. */
  readonly others: PanelPerson[];
  /** Whether others need a "Not on the team" heading: only when a team is named. */
  readonly othersHeading: boolean;
}

/** Who the team panel lists: the manager, the named team, then other people with open work. */
export function panelPeople(project: ProjectDetail): PanelPeople {
  const counts = new Map<string, { name: string; open: number; done: number }>();
  for (const task of project.tasks) {
    if (!task.assignee) continue;
    const current = counts.get(task.assignee.id) ?? {
      name: task.assignee.fullName,
      open: 0,
      done: 0,
    };
    const done = task.status === 'completed';
    counts.set(task.assignee.id, {
      ...current,
      open: current.open + (done ? 0 : 1),
      done: current.done + (done ? 1 : 0),
    });
  }
  const personOf = (id: string, name: string, inactive = false): PanelPerson => ({
    id,
    name,
    open: counts.get(id)?.open ?? 0,
    done: counts.get(id)?.done ?? 0,
    inactive,
  });
  const managerId = project.manager?.id;
  const team = project.setup.team
    .filter((member) => member.id !== managerId)
    .map((member) => personOf(member.id, member.fullName, !member.active));
  const listed = new Set([managerId, ...team.map((member) => member.id)]);
  const others = [...counts.entries()]
    .filter(([id, count]) => !listed.has(id) && count.open > 0)
    .map(([id, count]) => personOf(id, count.name));
  return {
    manager: project.manager ? personOf(project.manager.id, project.manager.fullName) : null,
    team,
    others,
    othersHeading: others.length > 0 && project.setup.team.length > 0,
  };
}
