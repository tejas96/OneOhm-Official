import {
  customers,
  type DatabaseExecutor,
  projects,
  projectTasks,
  properties,
  serviceRequests,
  visits,
} from '@oneohm/database';
import { type DutySiteCandidate, siteVisitKindOf } from '@oneohm/domain';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { serviceRequestRows, toTicket } from '../../common/read-models/service-request-rows';
import { placesOf } from '../service-visits/service-visit-read';

const WAITING = ['proposed', 'confirmed'] as const;

/** A piece of work at a customer's site, with who does it and what the live map shows. */
export interface SiteCandidate extends DutySiteCandidate {
  readonly assigneeUserId: string;
  /** The job: the task's title or the request's category. */
  readonly title: string;
  readonly customerName: string | null;
  readonly projectId: string | null;
  /** Start of each waiting planned visit, by day (minutes after midnight); null when untimed. */
  readonly startsByDay: ReadonlyMap<string, number | null>;
}

interface Waiting {
  readonly days: string[];
  readonly starts: Map<string, number | null>;
}

/** The planned visits still waiting, by task or by service request. */
async function waitingVisits(
  db: DatabaseExecutor,
  taskIds: readonly string[],
  requestIds: readonly string[],
): Promise<{ byTask: Map<string, Waiting>; byRequest: Map<string, Waiting> }> {
  const byTask = new Map<string, Waiting>();
  const byRequest = new Map<string, Waiting>();
  const add = (map: Map<string, Waiting>, id: string | null, day: string, start: number | null) => {
    if (!id) return;
    const entry: Waiting = map.get(id) ?? { days: [], starts: new Map() };
    entry.days.push(day);
    const known = entry.starts.get(day);
    entry.starts.set(day, known == null ? start : start === null ? known : Math.min(known, start));
    map.set(id, entry);
  };
  const select = { taskId: visits.taskId, requestId: visits.serviceRequestId, day: visits.day };
  const waiting = inArray(visits.status, [...WAITING]);
  if (taskIds.length > 0)
    for (const row of await db
      .select({ ...select, start: visits.startMin })
      .from(visits)
      .where(and(inArray(visits.taskId, [...taskIds]), waiting)))
      add(byTask, row.taskId, row.day, row.start);
  if (requestIds.length > 0)
    for (const row of await db
      .select({ ...select, start: visits.startMin })
      .from(visits)
      .where(and(inArray(visits.serviceRequestId, [...requestIds]), waiting)))
      add(byRequest, row.requestId, row.day, row.start);
  return { byTask, byRequest };
}

/**
 * Every open task with a site and every open service request the people are assigned, as
 * candidates for today's sites (Duty Day steps 3 and 4). `selectDutySites` decides which.
 */
export async function siteCandidates(
  db: DatabaseExecutor,
  userIds: readonly string[],
): Promise<SiteCandidate[]> {
  if (userIds.length === 0) return [];
  const taskRows = await db
    .select({
      task: projectTasks,
      propertyId: properties.id,
      label: properties.label,
      latitude: properties.latitude,
      longitude: properties.longitude,
      customerName: customers.name,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .leftJoin(customers, eq(customers.id, properties.customerId))
    .where(
      and(inArray(projectTasks.assigneeUserId, [...userIds]), ne(projectTasks.status, 'completed')),
    );
  const requests = await serviceRequestRows(
    db,
    and(
      inArray(serviceRequests.assigneeUserId, [...userIds]),
      ne(serviceRequests.status, 'resolved'),
    ),
  );
  const tickets = requests.map((row) => toTicket(row, new Date()));
  const [planned, places] = await Promise.all([
    waitingVisits(
      db,
      taskRows.map((row) => row.task.id),
      requests.map((row) => row.request.id),
    ),
    placesOf(db, tickets),
  ]);
  const candidates: SiteCandidate[] = [];
  for (const row of taskRows) {
    const kind = siteVisitKindOf(row.task);
    if (!kind || !row.task.assigneeUserId) continue;
    const waiting = planned.byTask.get(row.task.id);
    candidates.push({
      id: row.task.id,
      kind,
      label: row.label,
      placeId: row.propertyId,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.task.status,
      startDate: row.task.startDate,
      dueDate: row.task.dueDate,
      plannedDays: waiting?.days ?? [],
      assigneeUserId: row.task.assigneeUserId,
      title: row.task.title,
      customerName: row.customerName,
      projectId: row.task.projectId,
      startsByDay: waiting?.starts ?? new Map(),
    });
  }
  for (const [index, { request }] of requests.entries()) {
    const place = places.get(request.id);
    if (!place?.point || !request.assigneeUserId) continue;
    const waiting = planned.byRequest.get(request.id);
    const days = waiting?.days ?? [];
    candidates.push({
      id: request.id,
      kind: 'service',
      label: place.label,
      placeId: place.id,
      latitude: place.point.latitude,
      longitude: place.point.longitude,
      status: request.status,
      startDate: null,
      dueDate: null,
      plannedDays: request.visitOn ? [...days, request.visitOn] : days,
      assigneeUserId: request.assigneeUserId,
      title: tickets[index]?.categoryLabel ?? request.category,
      customerName: tickets[index]?.customer.name ?? null,
      projectId: null,
      startsByDay: waiting?.starts ?? new Map(),
    });
  }
  return candidates;
}
