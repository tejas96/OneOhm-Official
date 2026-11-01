import type { CurrentUser } from '@oneohm/api-contracts';
import { type Database, roleCapabilities, roles, userRoles, users } from '@oneohm/database';
import { type Capability, isCapability, type RoleKind } from '@oneohm/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';

const KIND_ORDER: readonly RoleKind[] = ['staff', 'partner', 'reseller'];

/** A person with their active roles and the union of those roles' capabilities. */
export async function loadCurrentUser(db: Database, userId: string): Promise<CurrentUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== 'active') return null;
  const roleRows = await db
    .select({ id: roles.id, key: roles.key, name: roles.name, kind: roles.kind })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), isNull(roles.archivedAt)));
  const grants =
    roleRows.length === 0
      ? []
      : await db
          .select({ capability: roleCapabilities.capability })
          .from(roleCapabilities)
          .where(
            inArray(
              roleCapabilities.roleId,
              roleRows.map((role) => role.id),
            ),
          );
  const capabilities = [...new Set(grants.map((grant) => grant.capability))].filter(
    isCapability,
  ) as Capability[];
  const kind =
    KIND_ORDER.find((candidate) => roleRows.some((role) => role.kind === candidate)) ?? 'staff';
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phoneE164,
    kind,
    roles: roleRows,
    capabilities: capabilities.sort(),
  };
}
