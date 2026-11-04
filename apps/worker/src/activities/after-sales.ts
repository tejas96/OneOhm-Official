import {
  amcContracts,
  amcVisits,
  customers,
  type Database,
  type DatabaseExecutor,
  type Notice,
  notify,
  notifyHolders,
  openServiceRequest,
  projects,
  queueCustomerMessage,
} from '@oneohm/database';
import { MAINTENANCE_VISIT_CATEGORY, VISIT_LEAD_DAYS } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, between, eq, isNull, sql } from 'drizzle-orm';

/** "Sat, 7 Nov" for a calendar date, as customers read it. */
export function visitDay(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The visit's service request text, with what the plan says each visit includes. */
export function visitDescription(visit: {
  readonly visitName: string;
  readonly position: number;
  readonly visits: number;
  readonly planName: string;
  readonly dueOn: string;
  readonly includes: readonly string[];
}): string {
  const planned = `Planned ${visit.visitName} visit ${visit.position} of ${visit.visits} under the ${visit.planName} AMC, on ${visitDay(visit.dueOn)}.`;
  const includes = visit.includes.map((item) => item.trim()).filter(Boolean);
  return includes.length ? `${planned} Includes: ${includes.join('; ')}.` : planned;
}

/** The service team, and the person the work went to when they are not on it already. */
export async function tellServiceTeam(
  db: DatabaseExecutor,
  notice: Notice,
  assigneeUserId: string | null,
): Promise<number> {
  const sent = await notifyHolders(db, 'service.manage', notice);
  if (!assigneeUserId) return sent;
  // The same key as notifyHolders uses, so a holder who is also the assignee hears once.
  await notify(
    db,
    { userId: assigneeUserId },
    {
      ...notice,
      dedupeKey: `${notice.dedupeKey}:${assigneeUserId}`,
    },
  );
  return sent + 1;
}

async function dueVisits(db: Database, today: string) {
  return db
    .select({
      visitId: amcVisits.id,
      position: amcVisits.position,
      dueOn: amcVisits.dueOn,
      contractId: amcContracts.id,
      planName: amcContracts.planName,
      visitName: amcContracts.visitName,
      includes: amcContracts.includes,
      visits: sql<number>`(select count(*) from amc_visits v where v.contract_id = ${amcContracts.id})::int`,
      projectId: projects.id,
      code: projects.code,
      customerId: customers.id,
      customer: customers.name,
      phone: customers.phoneE164,
    })
    .from(amcVisits)
    .innerJoin(amcContracts, eq(amcContracts.id, amcVisits.contractId))
    .innerJoin(projects, eq(projects.id, amcContracts.projectId))
    .innerJoin(customers, eq(customers.id, amcContracts.customerId))
    .where(
      and(
        isNull(amcVisits.serviceRequestId),
        isNull(amcContracts.cancelledAt),
        between(amcVisits.dueOn, today, addDays(today, VISIT_LEAD_DAYS)),
      ),
    );
}

type DueVisit = Awaited<ReturnType<typeof dueVisits>>[number];

/** One visit becomes a service request, the team hears, and the customer is told. */
async function openVisit(db: Database, visit: DueVisit): Promise<boolean> {
  return db.transaction(async (tx) => {
    const day = visitDay(visit.dueOn);
    const opened = await openServiceRequest(tx, {
      customerId: visit.customerId,
      projectId: visit.projectId,
      category: MAINTENANCE_VISIT_CATEGORY,
      description: visitDescription(visit),
      scheduledFor: visit.dueOn,
    });
    const linked = await tx
      .update(amcVisits)
      .set({ serviceRequestId: opened.id })
      .where(and(eq(amcVisits.id, visit.visitId), isNull(amcVisits.serviceRequestId)))
      .returning({ id: amcVisits.id });
    // Another run linked it first: undo this one by rolling back.
    if (linked.length === 0) throw new VisitTaken();
    await tellServiceTeam(
      tx,
      {
        kind: 'maintenance_visit',
        title: `Maintenance visit on ${day} for ${visit.code}`,
        body: `${visit.customer}: ${visit.visitName} under ${visit.planName}. ${opened.assigneeUserId ? 'Assigned.' : 'Assign someone and confirm the time with the customer.'}`,
        subject: { type: 'service_request', id: opened.id, projectId: visit.projectId },
        dedupeKey: `amc_visit:${visit.visitId}`,
      },
      opened.assigneeUserId,
    );
    await queueCustomerMessage(
      tx,
      visit.phone,
      'maintenance_visit',
      { customer: visit.customer, visit: visit.visitName, date: day, project: visit.code },
      `amc_visit:${visit.visitId}`,
    );
    return true;
  });
}

class VisitTaken extends Error {}

/**
 * Each morning, AMC visits due within a week become "maintenance visit" service requests
 * (PRD 3.17): assigned like other service work, with an alert to the service team and a
 * WhatsApp to the customer. Each visit opens once.
 */
export async function openMaintenanceVisits(db: Database, today: string): Promise<number> {
  let opened = 0;
  for (const visit of await dueVisits(db, today)) {
    try {
      if (await openVisit(db, visit)) opened += 1;
    } catch (error) {
      if (!(error instanceof VisitTaken)) throw error;
    }
  }
  return opened;
}
