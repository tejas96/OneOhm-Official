import type { VisitListRow } from '@oneohm/api-contracts';
import { customers, type DatabaseExecutor, leads, users, visits } from '@oneohm/database';
import { slotLabel } from '@oneohm/domain';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { invalid } from '../../common/http/errors';

const HALF = { morning: 'Morning', afternoon: 'Afternoon' } as const;

/**
 * The visits page: every visit of the days asked, soonest first, with the customer, the place and who
 * comes. People who see all leads, projects or service see everyone's (filtered by `userId` when
 * given); anyone else sees only the visits they come to.
 */
export async function listVisits(
  db: DatabaseExecutor,
  actor: Actor,
  query: { from: string; to: string; userId?: string | undefined },
): Promise<VisitListRow[]> {
  if (query.to < query.from) throw invalid('The end day is before the start day.');
  const team =
    can(actor, 'leads.view_all') || can(actor, 'projects.view_all') || can(actor, 'service.manage');
  const person = team ? query.userId : actor.userId;
  const rows = await db
    .select({
      visit: visits,
      customer: customers.name,
      customerPhone: customers.phoneE164,
      lead: leads.name,
      leadPhone: leads.phoneE164,
      leadCity: leads.city,
    })
    .from(visits)
    .leftJoin(customers, eq(customers.id, visits.customerId))
    .leftJoin(leads, eq(leads.id, visits.leadId))
    .where(
      and(
        gte(visits.day, query.from),
        lte(visits.day, query.to),
        person ? sql`${visits.crewUserIds} && ARRAY[${person}::uuid]` : undefined,
      ),
    )
    .orderBy(asc(visits.day), asc(visits.startMin), asc(visits.slot))
    .limit(500);
  const ids = [...new Set(rows.flatMap((row) => row.visit.crewUserIds))];
  const names = ids.length
    ? await db
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const nameOf = new Map(names.map((one) => [one.id, one.name]));
  return rows.map(({ visit, ...row }) => ({
    id: visit.id,
    kind: visit.kind,
    status: visit.status,
    day: visit.day,
    startMin: visit.startMin,
    time:
      visit.startMin != null && visit.endMin != null
        ? slotLabel(visit.startMin, visit.endMin)
        : HALF[visit.slot],
    customer: row.customer ?? row.lead ?? '—',
    phone: row.customerPhone ?? row.leadPhone ?? '',
    home: row.leadCity ?? '',
    crew: visit.crewUserIds.map((id) => ({ id, name: nameOf.get(id) ?? '—' })),
    leadId: visit.leadId,
    taskId: visit.taskId,
    projectId: visit.projectId,
    serviceRequestId: visit.serviceRequestId,
    customerConfirmed: visit.customerConfirmedAt !== null,
  }));
}
