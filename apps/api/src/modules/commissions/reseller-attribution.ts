import { type DatabaseExecutor, leads, roles, userRoles, users } from '@oneohm/database';
import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';

export interface Reseller {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly active: boolean;
}

/** Everyone holding a reseller role (PRD 4.8), whatever else they hold. */
export async function resellers(db: DatabaseExecutor): Promise<Reseller[]> {
  const rows = await db
    .selectDistinct({
      id: users.id,
      fullName: users.fullName,
      phone: users.phoneE164,
      status: users.status,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .where(eq(roles.kind, 'reseller'));
  return rows
    .map((row) => ({
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      active: row.status === 'active',
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export type AttributedLead = typeof leads.$inferSelect & { readonly resellerId: string };

/**
 * Leads a reseller sold: the ones they brought (lead source reseller) or own. A lead
 * brought by one reseller is never credited to another.
 */
export async function resellerLeads(
  db: DatabaseExecutor,
  resellerIds: readonly string[],
): Promise<AttributedLead[]> {
  if (resellerIds.length === 0) return [];
  const ids = [...resellerIds];
  const owned: SQL | undefined = and(isNull(leads.resellerUserId), inArray(leads.ownerUserId, ids));
  const rows = await db
    .select()
    .from(leads)
    .where(or(inArray(leads.resellerUserId, ids), owned));
  return rows.map((row) => ({
    ...row,
    resellerId: (row.resellerUserId ?? row.ownerUserId) as string,
  }));
}
