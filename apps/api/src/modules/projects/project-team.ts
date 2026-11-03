import {
  contractorMembers,
  contractors,
  type DatabaseExecutor,
  projectContractors,
  projectTeamMembers,
  roles,
  type Transaction,
  userRoles,
  users,
} from '@oneohm/database';
import {
  type AssigneeCandidate,
  type ContractorOption,
  chooseContractor,
  type GeneratedTask,
  type ProjectPool,
} from '@oneohm/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';
import { loadContractorOptions } from './task-library.loader';

export interface TeamChoice {
  /** The crew company the owner picked; left out lets the engine pick one. */
  readonly contractorId?: string | null | undefined;
  /** People named for the project; empty means anyone in the company. */
  readonly teamUserIds?: readonly string[] | undefined;
}

export interface ResolvedTeam {
  readonly pool: ProjectPool;
  /** True when the owner picked the contractor, false when the engine did. */
  readonly contractorChosen: boolean;
}

/**
 * The named people must be active staff, not a contractor's crew. People in `keep` (the
 * project's current team) are not checked again, so a member who has since left can stay
 * on the list or be taken off it.
 */
export async function checkTeam(
  db: DatabaseExecutor,
  userIds: readonly string[],
  keep: readonly string[] = [],
): Promise<void> {
  const ids = userIds.filter((id) => !keep.includes(id));
  if (ids.length === 0) return;
  const found = await db
    .selectDistinct({ id: users.id, crew: contractorMembers.contractorId })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
    .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
    .where(and(inArray(users.id, ids), eq(users.status, 'active')));
  if (found.length !== new Set(ids).size || found.some((person) => person.crew !== null))
    throw invalid('Pick active team members from your own staff.', {
      teamUserIds: 'Only active staff can be on the team, not crews or resellers.',
    });
}

function ownerPick(options: readonly ContractorOption[], contractorId: string): ContractorOption {
  const picked = options.find((option) => option.id === contractorId);
  if (!picked) throw invalid('Choose the contractor.', { contractorId: 'Unknown contractor.' });
  if (!picked.active)
    throw invalid('That contractor is switched off.', {
      contractorId: 'Switch the contractor on first, or choose another.',
    });
  return picked;
}

/**
 * Who may take the new project's tasks (PRD 3.8, Flow H): the named team, and one
 * contractor for all crew work: the owner's pick, or the least busy active contractor
 * who takes that work in the site's area.
 */
export async function resolveProjectTeam(
  db: DatabaseExecutor,
  choice: TeamChoice,
  generated: readonly GeneratedTask[],
  candidates: readonly AssigneeCandidate[],
  places: readonly string[],
): Promise<ResolvedTeam> {
  const team = [...new Set(choice.teamUserIds ?? [])];
  await checkTeam(db, team);
  const { options, crewOf } = await loadContractorOptions(db, candidates);
  if (choice.contractorId) {
    const contractor = ownerPick(options, choice.contractorId);
    return { pool: { team, contractor, crewOf }, contractorChosen: true };
  }
  const needed = [...new Set(generated.map((task) => task.roleKey))];
  const contractor = chooseContractor(options, needed, places);
  return { pool: { team, contractor, crewOf }, contractorChosen: false };
}

/** Saves the project's contractor and named team with the project. */
export async function saveProjectTeam(
  tx: Transaction,
  projectId: string,
  resolved: ResolvedTeam,
  userId: string,
): Promise<void> {
  const { contractor, team } = resolved.pool;
  if (contractor)
    await tx.insert(projectContractors).values({
      projectId,
      contractorId: contractor.id,
      chosenByUserId: resolved.contractorChosen ? userId : null,
    });
  if (team.length > 0)
    await tx
      .insert(projectTeamMembers)
      .values(team.map((memberId) => ({ projectId, userId: memberId })));
}

/** The project's contractor and named team, for its overview. */
export async function projectTeamOf(db: DatabaseExecutor, projectId: string) {
  const [contractor] = await db
    .select({ id: contractors.id, name: contractors.name, active: contractors.active })
    .from(projectContractors)
    .innerJoin(contractors, eq(contractors.id, projectContractors.contractorId))
    .where(eq(projectContractors.projectId, projectId))
    .limit(1);
  const members = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      active: sql<boolean>`${users.status} = 'active'`,
    })
    .from(projectTeamMembers)
    .innerJoin(users, eq(users.id, projectTeamMembers.userId))
    .where(eq(projectTeamMembers.projectId, projectId));
  return { contractor: contractor ?? null, team: members };
}
