import { roles, type Transaction, userRoles, users } from '@oneohm/database';
import { SUPER_ADMIN_ROLE_KEY } from '@oneohm/domain';
import { and, eq, ne } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';

/** There must always be at least one active Super Admin: for role edits, switching off and removal. */
export async function assertKeepsASuperAdmin(
  tx: Transaction,
  userId: string,
  nextRoleIds: readonly string[] | undefined,
  nextStatus: 'active' | 'inactive' | undefined,
): Promise<void> {
  const [superAdmin] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, SUPER_ADMIN_ROLE_KEY))
    .limit(1);
  if (!superAdmin) return;
  const keeps =
    nextStatus !== 'inactive' && (nextRoleIds ? nextRoleIds.includes(superAdmin.id) : true);
  if (keeps) return;
  const holders = await tx
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(
      and(eq(userRoles.roleId, superAdmin.id), eq(users.status, 'active'), ne(users.id, userId)),
    );
  if (holders.length === 0)
    throw conflict('Someone else must be a Super Admin first.', 'last_super_admin');
}
