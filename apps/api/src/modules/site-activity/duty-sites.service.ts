import { Inject, Injectable } from '@nestjs/common';
import type { DutySiteRecord } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  projects,
  projectTasks,
  properties,
  serviceRequests,
  visits,
} from '@oneohm/database';
import { type DutySiteCandidate, selectDutySites, siteVisitKindOf } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { currentCalendar } from '../../common/calendar';
import { serviceRequestRows, toTicket } from '../../common/read-models/service-request-rows';
import { DATABASE, type Database } from '../../config/core.module';
import { openVisitOf, placesOf } from '../service-visits/service-visit-read';
import { loadPolicy } from '../workforce/policy';

const WAITING = ['proposed', 'confirmed'] as const;

/** Days of the planned visits still waiting, by task or by service request. */
async function plannedDays(
  db: DatabaseExecutor,
  taskIds: readonly string[],
  requestIds: readonly string[],
): Promise<{ byTask: Map<string, string[]>; byRequest: Map<string, string[]> }> {
  const byTask = new Map<string, string[]>();
  const byRequest = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, id: string | null, day: string) => {
    if (id) map.set(id, [...(map.get(id) ?? []), day]);
  };
  if (taskIds.length > 0)
    for (const row of await db
      .select({ id: visits.taskId, day: visits.day })
      .from(visits)
      .where(and(inArray(visits.taskId, [...taskIds]), inArray(visits.status, [...WAITING]))))
      add(byTask, row.id, row.day);
  if (requestIds.length > 0)
    for (const row of await db
      .select({ id: visits.serviceRequestId, day: visits.day })
      .from(visits)
      .where(
        and(
          inArray(visits.serviceRequestId, [...requestIds]),
          inArray(visits.status, [...WAITING]),
        ),
      ))
      add(byRequest, row.id, row.day);
  return { byTask, byRequest };
}

/**
 * The sites where the person has work on `today` and a saved pin, each with the fence radius
 * from Settings (Duty Day step 3). Empty when automatic visits are switched off. The phone
 * fences these and the route backstop reads the same list.
 */
export async function dutySitesFor(
  db: DatabaseExecutor,
  userId: string,
  today: string,
): Promise<DutySiteRecord[]> {
  const policy = await loadPolicy(db);
  if (!policy.travel.autoSiteVisits) return [];
  const taskRows = await db
    .select({
      task: projectTasks,
      propertyId: properties.id,
      label: properties.label,
      latitude: properties.latitude,
      longitude: properties.longitude,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(and(eq(projectTasks.assigneeUserId, userId), ne(projectTasks.status, 'completed')));
  const requests = await serviceRequestRows(
    db,
    and(eq(serviceRequests.assigneeUserId, userId), ne(serviceRequests.status, 'resolved')),
  );
  const tickets = requests.map((row) => toTicket(row, new Date()));
  const [planned, places] = await Promise.all([
    plannedDays(
      db,
      taskRows.map((row) => row.task.id),
      requests.map((row) => row.request.id),
    ),
    placesOf(db, tickets),
  ]);
  const candidates: DutySiteCandidate[] = [];
  for (const row of taskRows) {
    const kind = siteVisitKindOf(row.task);
    if (!kind) continue;
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
      plannedDays: planned.byTask.get(row.task.id) ?? [],
    });
  }
  for (const { request } of requests) {
    const place = places.get(request.id);
    if (!place?.point) continue;
    const days = planned.byRequest.get(request.id) ?? [];
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
    });
  }
  return selectDutySites(candidates, today, policy.travel.siteFenceM);
}

@Injectable()
export class DutySitesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The person's open visit anywhere, for the Today card; null when not checked in. */
  openVisit(userId: string) {
    return openVisitOf(this.db, userId);
  }

  forToday(userId: string): Promise<DutySiteRecord[]> {
    return dutySitesFor(this.db, userId, todayIn(currentCalendar().timeZone));
  }
}
