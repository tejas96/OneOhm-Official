import type { ProjectDetail } from '@oneohm/api-contracts';

/**
 * What the team sheet starts from: the project as it is now. `version` is the one the
 * form was seeded from, so a refetch behind the open sheet cannot make an outdated form
 * look current to the server.
 */
export function seedTeamForm(project: ProjectDetail): {
  version: number;
  manager: string | undefined;
  team: string[];
  target: string;
} {
  return {
    version: project.version,
    manager: project.manager?.id,
    team: project.setup.team.map((member) => member.id),
    target: project.setup.targetFinishDate ?? '',
  };
}
