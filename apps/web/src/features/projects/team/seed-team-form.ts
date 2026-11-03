import type { ProjectDetail } from '@oneohm/api-contracts';

/** What the team sheet starts from: the project as it is now. */
export function seedTeamForm(project: ProjectDetail): {
  manager: string | undefined;
  team: string[];
  target: string;
} {
  return {
    manager: project.manager?.id,
    team: project.setup.team.map((member) => member.id),
    target: project.setup.targetFinishDate ?? '',
  };
}
