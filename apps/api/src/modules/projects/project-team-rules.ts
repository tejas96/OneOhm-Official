import {
  contractorMembers,
  type DatabaseExecutor,
  holdersOf,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { conflict, invalid } from '../../common/http/errors';

export type ManagerProblem = 'not_active_staff' | 'cannot_view_projects';

/** Why this person cannot manage a project: not active staff (or crew), or cannot open projects. */
async function managerProblem(
  db: DatabaseExecutor,
  userId: string,
): Promise<ManagerProblem | null> {
  const [person] = await db
    .select({ id: users.id, crew: contractorMembers.contractorId })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
    .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.status, 'active')))
    .limit(1);
  if (!person || person.crew) return 'not_active_staff';
  if (!(await holdersOf(db, 'projects.view_all')).includes(userId)) return 'cannot_view_projects';
  return null;
}

/** Who may manage a project: an active staff member (not crew) who can open projects. */
export async function canManageProjects(db: DatabaseExecutor, userId: string): Promise<boolean> {
  return (await managerProblem(db, userId)) === null;
}

export async function checkManagerCandidate(db: DatabaseExecutor, userId: string): Promise<void> {
  const problem = await managerProblem(db, userId);
  if (problem === 'not_active_staff')
    throw invalid('Pick an active staff member as manager.', {
      managerUserId: 'Choose someone from your own staff.',
    });
  if (problem === 'cannot_view_projects')
    throw invalid('Pick someone who can see projects as manager.', {
      managerUserId: 'This person cannot open projects. Pick someone else.',
    });
}

/** A completed or cancelled project keeps the team it ended with. */
export function assertTeamEditable(project: { status: string }): void {
  if (project.status === 'completed' || project.status === 'cancelled')
    throw conflict('This project is closed. Its team can no longer change.', 'project_closed');
}
