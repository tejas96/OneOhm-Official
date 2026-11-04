import { type DatabaseExecutor, leaveRequests, roles, userRoles, users } from '@oneohm/database';
import { leaveApproverProblem, SUPER_ADMIN_ROLE_KEY } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import { managerOf } from '../people/reporting-line';

/** Active Super Admins (by id). */
async function activeSuperAdmins(db: DatabaseExecutor): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(roles.key, SUPER_ADMIN_ROLE_KEY), eq(users.status, 'active')));
  return rows.map((row) => row.id);
}

/**
 * Who may decide this request: not the person asking, not the backup who covers it, and
 * for a Super Admin's leave the other Super Admins or the manager, when there are any.
 */
export async function assertMayDecide(
  db: DatabaseExecutor,
  approverId: string,
  row: typeof leaveRequests.$inferSelect,
): Promise<void> {
  const admins = await activeSuperAdmins(db);
  const applicantIsSuperAdmin = admins.includes(row.userId);
  const manager = applicantIsSuperAdmin ? await managerOf(db, row.userId) : null;
  const problem = leaveApproverProblem({
    approverId,
    applicantId: row.userId,
    backupUserId: row.backupUserId,
    applicantIsSuperAdmin,
    seniors: [...admins, ...(manager?.active ? [manager.id] : [])],
  });
  if (problem === 'own') throw conflict('Someone else approves your own leave.', 'own');
  if (problem === 'backup')
    throw conflict('You are covering this leave, so someone else decides it.', 'backup');
  if (problem === 'seniors_only')
    throw conflict(
      'A Super Admin’s leave is decided by another Super Admin or their manager.',
      'seniors',
    );
}
