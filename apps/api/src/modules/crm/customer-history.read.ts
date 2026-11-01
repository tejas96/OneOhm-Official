import type { CustomerAftercare, CustomerLeadEntry } from '@oneohm/api-contracts';
import { type DatabaseExecutor, leadActivities, leads, projects, users } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { asc, desc, eq, inArray, or } from 'drizzle-orm';
import { assetsOf, contractsOf } from '../after-sales/after-sales.read';

/** Calls, visits, notes and follow-ups from the customer's leads, newest first (PRD 3.2). */
export async function customerLeadHistory(
  db: DatabaseExecutor,
  customer: { readonly id: string; readonly phone: string },
): Promise<CustomerLeadEntry[]> {
  const own = await db
    .select({ id: leads.id, name: leads.name })
    .from(leads)
    .where(or(eq(leads.customerId, customer.id), eq(leads.phoneE164, customer.phone)));
  if (own.length === 0) return [];
  const rows = await db
    .select({ activity: leadActivities, userName: users.fullName })
    .from(leadActivities)
    .leftJoin(users, eq(users.id, leadActivities.userId))
    .where(
      inArray(
        leadActivities.leadId,
        own.map((lead) => lead.id),
      ),
    )
    .orderBy(desc(leadActivities.createdAt))
    .limit(200);
  return rows.map(({ activity, userName }) => ({
    id: activity.id,
    kind: activity.kind,
    note: activity.note,
    user: activity.userId && userName ? { id: activity.userId, fullName: userName } : null,
    internal: activity.internal,
    createdAt: activity.createdAt.toISOString(),
    lead: own.find((lead) => lead.id === activity.leadId) ?? { id: activity.leadId, name: '' },
  }));
}

/** Each project's installed items with their warranty, and its AMCs; read-only (PRD 3.2). */
export async function customerAftercare(
  db: DatabaseExecutor,
  customerId: string,
): Promise<CustomerAftercare[]> {
  const own = await db
    .select({ id: projects.id, code: projects.code })
    .from(projects)
    .where(eq(projects.customerId, customerId))
    .orderBy(asc(projects.createdAt));
  if (own.length === 0) return [];
  const today = todayIn();
  const ids = own.map((project) => project.id);
  const [assets, contracts] = await Promise.all([
    assetsOf(db, ids, today),
    contractsOf(db, ids, today),
  ]);
  return own.map((project) => ({
    project,
    assets: assets.get(project.id) ?? [],
    amcs: contracts.get(project.id) ?? [],
  }));
}
