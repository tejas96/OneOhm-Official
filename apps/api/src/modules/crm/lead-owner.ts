import type { LeadOwner } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  leads,
  roleCapabilities,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import { type OwnerCandidate, pickLeadOwner } from '@oneohm/domain';
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';

interface Holder {
  readonly userId: string;
  readonly name: string;
  readonly onLeave: boolean;
  readonly system: boolean;
}

/** Active people whose staff role manages leads (one row per role). */
function holders(db: DatabaseExecutor): Promise<Holder[]> {
  return db
    .select({
      userId: users.id,
      name: users.fullName,
      onLeave: users.onLeave,
      system: roles.system,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(
      roles,
      and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt), eq(roles.kind, 'staff')),
    )
    .innerJoin(
      roleCapabilities,
      and(eq(roleCapabilities.roleId, roles.id), eq(roleCapabilities.capability, 'leads.manage')),
    )
    .where(eq(users.status, 'active'))
    .orderBy(asc(users.fullName));
}

/** Each person once, with how many open leads they already own. */
async function withLoads(db: DatabaseExecutor, rows: readonly Holder[]): Promise<OwnerCandidate[]> {
  const ids = [...new Set(rows.map((row) => row.userId))];
  if (ids.length === 0) return [];
  const loads = await db
    .select({ userId: leads.ownerUserId, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(inArray(leads.ownerUserId, ids), notInArray(leads.stage, ['won', 'lost'])))
    .groupBy(leads.ownerUserId);
  return ids.map((userId) => {
    const holder = rows.find((row) => row.userId === userId);
    return {
      userId,
      name: holder?.name ?? '',
      onLeave: holder?.onLeave ?? false,
      openLeads: loads.find((load) => load.userId === userId)?.count ?? 0,
    };
  });
}

/**
 * Who owns a lead nobody picked (PRD 3.3): an active staff member whose role manages
 * leads, fewest open leads first (`pickLeadOwner`). The Super Admin's all-powers role
 * only counts when nobody else manages leads. Null only when no one can.
 */
export async function ownerByRule(db: DatabaseExecutor): Promise<string | null> {
  const all = await holders(db);
  const sellers = all.filter((holder) => !holder.system);
  return pickLeadOwner(await withLoads(db, sellers.length > 0 ? sellers : all));
}

/** Everyone a lead can be given to, for the owner pickers. */
export async function leadOwnerOptions(db: DatabaseExecutor): Promise<LeadOwner[]> {
  const people = await withLoads(db, await holders(db));
  return people.map((person) => ({
    id: person.userId,
    fullName: person.name,
    openLeads: person.openLeads,
    onLeave: person.onLeave,
  }));
}

/** An owner must be able to work on leads; a crew member or accountant cannot. */
export async function assertCanOwnLeads(db: DatabaseExecutor, userId: string): Promise<void> {
  const rows = await holders(db);
  if (!rows.some((row) => row.userId === userId)) {
    throw invalid('Pick someone who works on leads.', {
      ownerUserId: 'This person cannot work on leads. Pick someone in Sales.',
    });
  }
}
