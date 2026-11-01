import { type DatabaseExecutor, projectContractors, projectTeamMembers } from '@oneohm/database';
import type { AssigneeCandidate, ProjectPool } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { loadContractorOptions } from '../projects/task-library.loader';

/** Who may take a live project's new tasks: its named team and its one contractor. */
export async function projectPool(
  db: DatabaseExecutor,
  projectId: string,
  candidates: readonly AssigneeCandidate[],
): Promise<ProjectPool> {
  const team = await db
    .select({ userId: projectTeamMembers.userId })
    .from(projectTeamMembers)
    .where(eq(projectTeamMembers.projectId, projectId));
  const [picked] = await db
    .select({ id: projectContractors.contractorId })
    .from(projectContractors)
    .where(eq(projectContractors.projectId, projectId))
    .limit(1);
  const { options, crewOf } = await loadContractorOptions(db, candidates);
  return {
    team: team.map((member) => member.userId),
    contractor: options.find((option) => option.id === picked?.id) ?? null,
    crewOf,
  };
}
