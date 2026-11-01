import {
  amcVisits,
  customers,
  type Database,
  projects,
  serviceCategories,
  serviceRequests,
  users,
} from '@oneohm/database';
import { type SlaState, serviceSla, slaAlertStage } from '@oneohm/domain';
import { and, eq, isNotNull, ne, or } from 'drizzle-orm';
import { tellServiceTeam } from './after-sales';

type Clock = 'response' | 'resolution';

const TITLE: Readonly<Record<Clock, Readonly<Record<'due_soon' | 'breached', string>>>> = {
  response: { due_soon: 'Reply due soon', breached: 'Reply time missed' },
  resolution: { due_soon: 'Resolution due soon', breached: 'Resolution time missed' },
};

/** "2 Nov, 3:30 pm" in India. */
function when(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(at);
}

async function openRequests(db: Database) {
  return db
    .select({
      request: serviceRequests,
      customer: customers.name,
      code: projects.code,
      label: serviceCategories.label,
      assignee: users.fullName,
      scheduledFor: amcVisits.dueOn,
    })
    .from(serviceRequests)
    .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
    .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
    .leftJoin(serviceCategories, eq(serviceCategories.key, serviceRequests.category))
    .leftJoin(users, eq(users.id, serviceRequests.assigneeUserId))
    .leftJoin(amcVisits, eq(amcVisits.serviceRequestId, serviceRequests.id))
    .where(
      and(
        ne(serviceRequests.status, 'resolved'),
        or(isNotNull(serviceRequests.responseDueAt), isNotNull(serviceRequests.resolutionDueAt)),
      ),
    );
}

/**
 * Requests about to miss, or past, a promised response or resolution time alert the
 * service team and the person on it (PRD 7.2). Each clock alerts once per stage.
 */
export async function queueSlaAlerts(db: Database, now: Date, timeZone: string): Promise<number> {
  let sent = 0;
  for (const row of await openRequests(db)) {
    const { request } = row;
    const status = serviceSla({ ...request, scheduledFor: row.scheduledFor }, now);
    const clocks: readonly [Clock, SlaState | null, Date | null][] = [
      ['response', status.response, request.responseDueAt],
      ['resolution', status.resolution, request.resolutionDueAt],
    ];
    for (const [clock, state, dueAt] of clocks) {
      const stage = slaAlertStage(state);
      if (!stage || !dueAt) continue;
      const what = [row.label ?? request.category, row.customer, row.code].filter(Boolean);
      const who = row.assignee ? `With ${row.assignee}.` : 'Nobody is on it yet.';
      sent += await tellServiceTeam(
        db,
        {
          kind: `service_sla_${stage}`,
          title: TITLE[clock][stage],
          body: `${what.join(' · ')}. Due ${when(dueAt, timeZone)}. ${who}`,
          subject: { type: 'service_request', id: request.id, projectId: request.projectId },
          dedupeKey: `sla:${request.id}:${clock}:${stage}`,
        },
        request.assigneeUserId,
      );
    }
  }
  return sent;
}
