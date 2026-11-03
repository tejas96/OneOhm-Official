import { contractorMembers, holdersOf, roles, userRoles, users } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { conflict, invalid } from '../../common/http/errors';
import type { Database } from '../../config/core.module';

/** Who may manage a project: an active staff member (not crew) who can open projects. */
export async function checkManagerCandidate(db: Database, userId: string): Promise<void> {
  const [person] = await db
    .select({ id: users.id, crew: contractorMembers.contractorId })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
    .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.status, 'active')))
    .limit(1);
  if (!person || person.crew)
    throw invalid('Pick an active staff member as manager.', {
      managerUserId: 'Choose someone from your own staff.',
    });
  if (!(await holdersOf(db, 'projects.view_all')).includes(userId))
    throw invalid('Pick someone who can see projects as manager.', {
      managerUserId: 'This person cannot open projects. Pick someone else.',
    });
}

/** A completed or cancelled project keeps the team it ended with. */
export function assertTeamEditable(project: { status: string }): void {
  if (project.status === 'completed' || project.status === 'cancelled')
    throw conflict('This project is closed. Its team can no longer change.', 'project_closed');
}
