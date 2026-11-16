import type { LiveSite } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  dutyAlerts,
  projects,
  projectTasks,
  properties,
  serviceRequests,
  visits,
} from '@oneohm/database';
import { liveSiteStatus, siteVisitKindOf } from '@oneohm/domain';
import { and, eq, inArray, or } from 'drizzle-orm';
import { serviceRequestRows, toTicket } from '../../common/read-models/service-request-rows';
import { placesOf } from '../service-visits/service-visit-read';

const WAITING = ['proposed', 'confirmed'] as const;

type SiteBase = Omit<LiveSite, 'status' | 'plannedStartMin'>;

/** The task's or the request's site, wherever it is assigned; null without a saved pin. */
async function workSite(
  db: DatabaseExecutor,
  siteId: string,
  radiusM: number,
): Promise<SiteBase | null> {
  const [task] = await db
    .select({
      task: projectTasks,
      label: properties.label,
      latitude: properties.latitude,
      longitude: properties.longitude,
      customerName: customers.name,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .leftJoin(customers, eq(customers.id, properties.customerId))
    .where(eq(projectTasks.id, siteId))
    .limit(1);
  if (task) {
    if (task.latitude === null || task.longitude === null) return null;
    return {
      id: siteId,
      kind: siteVisitKindOf(task.task) ?? 'installation',
      label: task.task.title,
      siteLabel: task.label,
      customerName: task.customerName,
      latitude: task.latitude,
      longitude: task.longitude,
      radiusM,
      assigneeIds: task.task.assigneeUserId ? [task.task.assigneeUserId] : [],
      projectId: task.task.projectId,
    };
  }
  const [request] = await serviceRequestRows(db, eq(serviceRequests.id, siteId));
  if (!request) return null;
  const ticket = toTicket(request, new Date());
  const point = (await placesOf(db, [ticket])).get(siteId);
  if (!point?.point) return null;
  return {
    id: siteId,
    kind: 'service',
    label: ticket.categoryLabel,
    siteLabel: point.label,
    customerName: ticket.customer.name,
    latitude: point.point.latitude,
    longitude: point.point.longitude,
    radiusM,
    assigneeIds: request.request.assigneeUserId ? [request.request.assigneeUserId] : [],
    projectId: null,
  };
}

/**
 * In the caller's scope: the work is assigned to one of their people, one of them is in the
 * crew of today's planned visit, or a duty alert about one of them names it.
 */
export function workInScope(input: {
  readonly ids: readonly string[];
  readonly assigneeIds: readonly string[];
  readonly crews: readonly (readonly string[])[];
  readonly namedByAlert: boolean;
}): boolean {
  const mine = (id: string) => input.ids.includes(id);
  return (
    input.namedByAlert ||
    input.assigneeIds.some(mine) ||
    input.crews.some((crew) => crew.some(mine))
  );
}

/**
 * A site that is not on the caller's map (for "Send nearest" and Assign from an alert): the
 * task's or request's site, when it is in the caller's scope: assigned to one of their people,
 * planned for today with one of them in the crew, or named by a duty alert about one of them.
 * Null when it is none of those, or has no saved pin.
 */
export async function siteInScope(
  db: DatabaseExecutor,
  input: {
    readonly siteId: string;
    readonly ids: readonly string[];
    readonly today: string;
    readonly nowMin: number;
    readonly radiusM: number;
  },
): Promise<LiveSite | null> {
  if (input.ids.length === 0) return null;
  const site = await workSite(db, input.siteId, input.radiusM);
  if (!site) return null;
  const work = or(eq(visits.taskId, input.siteId), eq(visits.serviceRequestId, input.siteId));
  const [planned, named] = await Promise.all([
    db
      .select({ crew: visits.crewUserIds, start: visits.startMin })
      .from(visits)
      .where(and(work, eq(visits.day, input.today), inArray(visits.status, [...WAITING]))),
    db
      .select({ id: dutyAlerts.id })
      .from(dutyAlerts)
      .where(
        and(eq(dutyAlerts.subjectId, input.siteId), inArray(dutyAlerts.personId, [...input.ids])),
      )
      .limit(1),
  ]);
  const inScope = workInScope({
    ids: input.ids,
    assigneeIds: site.assigneeIds,
    crews: planned.map((visit) => visit.crew),
    namedByAlert: named.length > 0,
  });
  if (!inScope) return null;
  const starts = planned.flatMap((visit) => (visit.start === null ? [] : [visit.start]));
  const plannedStartMin = starts.length > 0 ? Math.min(...starts) : null;
  return {
    ...site,
    plannedStartMin,
    status: liveSiteStatus({
      open: false,
      visitedToday: false,
      plannedStartMin,
      nowMin: input.nowMin,
    }),
  };
}
