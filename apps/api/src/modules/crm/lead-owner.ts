import type { LeadOwner } from '@oneohm/api-contracts';
import {
  awayUserIds,
  type DatabaseExecutor,
  leads,
  notifyStaffHolders,
  readBusinessSetting,
  roleCapabilities,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import {
  DEFAULT_LEAD_ASSIGNMENT,
  isLeadAssignmentRules,
  type OwnerCandidate,
  pickLeadOwner,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, inArray, isNull, max, notInArray, sql } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';
import { environmentOnce } from '../../config/environment-once';

interface Holder {
  readonly userId: string;
  readonly name: string;
  readonly system: boolean;
}

/** Active people whose staff role manages leads (one row per role). */
function holders(db: DatabaseExecutor): Promise<Holder[]> {
  return db
    .select({ userId: users.id, name: users.fullName, system: roles.system })
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

/** Who is away today in the business time zone (approved leave, or marked on leave). */
const awayToday = (db: DatabaseExecutor) =>
  awayUserIds(db, todayIn(environmentOnce().BUSINESS_TIMEZONE));

/**
 * Each person once, with how many open leads they own and when they last got one (the
 * newest lead they own; round robin goes to whoever waited longest).
 */
async function withLoads(
  db: DatabaseExecutor,
  rows: readonly Holder[],
  away: ReadonlySet<string>,
): Promise<OwnerCandidate[]> {
  const ids = [...new Set(rows.map((row) => row.userId))];
  if (ids.length === 0) return [];
  const loads = await db
    .select({
      userId: leads.ownerUserId,
      open: sql<number>`(count(*) filter (where ${notInArray(leads.stage, ['won', 'lost'])}))::int`,
      last: max(leads.createdAt),
    })
    .from(leads)
    .where(inArray(leads.ownerUserId, ids))
    .groupBy(leads.ownerUserId);
  return ids.map((userId) => {
    const load = loads.find((row) => row.userId === userId);
    return {
      userId,
      name: rows.find((row) => row.userId === userId)?.name ?? '',
      away: away.has(userId),
      lastLeadAt: load?.last ?? null,
      openLeads: load?.open ?? 0,
    };
  });
}

/** The lead rule from Settings → Assignment; a damaged saved value falls back to the default. */
async function leadRules(db: DatabaseExecutor) {
  const saved = await readBusinessSetting(db, 'lead_assignment');
  return isLeadAssignmentRules(saved) ? saved : DEFAULT_LEAD_ASSIGNMENT;
}

export interface RuledOwner {
  readonly userId: string;
  /** Everyone who sells was away, so the lead went to the desk (the Super Admin). */
  readonly fallback: boolean;
}

/**
 * Who owns a lead nobody picked (PRD 3.3): an active staff member whose role manages
 * leads and who is not away today, chosen by the Settings rule (city owners first, then
 * least busy or round robin; `pickLeadOwner`). The Super Admin's all-powers role takes
 * the lead only when nobody else manages leads or everyone who does is away, even if
 * the Super Admin is away too, so a lead is never ownerless. Null only when no one can.
 */
export async function ownerByRule(
  db: DatabaseExecutor,
  options: { readonly city?: string | null } = {},
): Promise<RuledOwner | null> {
  const all = await holders(db);
  const sellers = all.filter((holder) => !holder.system);
  const away = await awayToday(db);
  const seller = pickLeadOwner(
    await withLoads(db, sellers, away),
    await leadRules(db),
    options.city,
  );
  if (seller) return { userId: seller, fallback: false };
  const desk = all.filter((holder) => holder.system);
  const last = await withLoads(db, desk.length > 0 ? desk : sellers, new Set());
  const owner = pickLeadOwner(last, DEFAULT_LEAD_ASSIGNMENT);
  return owner ? { userId: owner, fallback: sellers.length > 0 } : null;
}

/**
 * Tells the office a lead went to the desk because everyone was away, once per lead.
 * Staff only: resellers manage their own leads but never see others'.
 */
export async function alertNobodyFree(
  db: DatabaseExecutor,
  lead: { readonly id: string; readonly name: string },
): Promise<void> {
  await notifyStaffHolders(db, 'leads.manage', {
    kind: 'lead_needs_owner',
    title: 'New lead needs an owner',
    body: `${lead.name} came in while everyone is away. Pick an owner.`,
    subject: { type: 'lead', id: lead.id },
    dedupeKey: `lead_needs_owner:${lead.id}`,
  });
}

/** Everyone a lead can be given to, for the owner pickers. */
export async function leadOwnerOptions(db: DatabaseExecutor): Promise<LeadOwner[]> {
  const all = await holders(db);
  const people = await withLoads(db, all, await awayToday(db));
  return people.map((person) => ({
    id: person.userId,
    fullName: person.name,
    openLeads: person.openLeads,
    onLeave: person.away,
    system: all.filter((row) => row.userId === person.userId).every((row) => row.system),
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

/** Who can own leads now, and these people's names (deactivated people too). */
export async function cityOwnerStanding(
  db: DatabaseExecutor,
  ids: readonly string[],
): Promise<{ readonly canOwn: ReadonlySet<string>; readonly names: ReadonlyMap<string, string> }> {
  const canOwn = new Set((await holders(db)).map((row) => row.userId));
  const named =
    ids.length === 0
      ? []
      : await db
          .select({ id: users.id, name: users.fullName })
          .from(users)
          .where(inArray(users.id, [...ids]));
  return { canOwn, names: new Map(named.map((row) => [row.id, row.name])) };
}
