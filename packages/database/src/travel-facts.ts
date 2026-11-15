import {
  type GeoPoint,
  nearestLocation,
  orderStops,
  type TravelStop,
  type WorkLocation,
} from '@oneohm/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { serviceCategories } from './schema/after-sales.schema';
import { serviceRequests } from './schema/customer-portal.schema';
import { projects, projectTasks } from './schema/projects.schema';
import { siteVisits } from './schema/site-activity.schema';
import { attendanceDays, workLocations } from './schema/workforce.schema';

const point = (latitude: number | null, longitude: number | null): GeoPoint | null =>
  latitude !== null && longitude !== null ? { latitude, longitude } : null;

export interface TravelFacts {
  /** The person's attendance day, when there is one: its route points are the day's route. */
  readonly dayId: string | null;
  /** The person's attendance day has a check-out: person, night job or correction. */
  readonly closed: boolean;
  /** The day's stops in order, with a point only where one was kept. */
  readonly stops: TravelStop[];
  readonly visits: number;
  /** Some of the day's coordinates were already cleared by the retention sweep. */
  readonly cleared: boolean;
  /** Check-in and check-out, for the silence at either end of the route. */
  readonly window: { readonly from: Date; readonly to: Date | null } | null;
}

async function activePlaces(db: DatabaseExecutor): Promise<WorkLocation[]> {
  const rows = await db.select().from(workLocations).orderBy(asc(workLocations.createdAt));
  return rows
    .filter((row) => row.active)
    .map(({ id, name, latitude, longitude, radiusM }) => ({
      id,
      name,
      latitude,
      longitude,
      radiusM,
    }));
}

/**
 * The day's stops from the live rows: the office check-in, each site check-in in time
 * order, the office check-out. Coordinates may already be cleared for an old day, which
 * is why a closed day is saved (`takeTravelSnapshot`) before that happens.
 */
export async function readTravelFacts(
  db: DatabaseExecutor,
  userId: string,
  workDate: string,
): Promise<TravelFacts> {
  const [[day], visits] = await Promise.all([
    db
      .select({ day: attendanceDays, place: workLocations.name })
      .from(attendanceDays)
      .leftJoin(workLocations, eq(workLocations.id, attendanceDays.checkInLocationId))
      .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, workDate)))
      .limit(1),
    db
      .select({
        visit: siteVisits,
        taskTitle: projectTasks.title,
        serviceLabel: serviceCategories.label,
        projectCode: projects.code,
      })
      .from(siteVisits)
      .leftJoin(projectTasks, eq(projectTasks.id, siteVisits.taskId))
      .leftJoin(serviceRequests, eq(serviceRequests.id, siteVisits.serviceRequestId))
      .leftJoin(serviceCategories, eq(serviceCategories.key, serviceRequests.category))
      .leftJoin(projects, eq(projects.id, siteVisits.projectId))
      .where(and(eq(siteVisits.userId, userId), eq(siteVisits.workDate, workDate)))
      .orderBy(asc(siteVisits.checkInAt)),
  ]);
  const stops: TravelStop[] = [];
  if (day) {
    const start = point(day.day.checkInLatitude, day.day.checkInLongitude);
    // A check-in or check-out away from an office still marks where the day began or ended;
    // the review says so (`start_outside_office`) instead of the stop being dropped.
    if (start)
      stops.push({
        id: 'start',
        kind: 'start',
        label: day.place ?? 'Check-in',
        at: day.day.checkInAt.toISOString(),
        point: start,
      });
    const end = point(day.day.checkOutLatitude, day.day.checkOutLongitude);
    if (end && day.day.checkOutAt) {
      const place = nearestLocation(end, await activePlaces(db));
      stops.push({
        id: 'end',
        kind: 'end',
        label: place?.location.name ?? 'Check-out',
        at: day.day.checkOutAt.toISOString(),
        point: end,
      });
    }
  }
  for (const row of visits)
    stops.push({
      id: row.visit.id,
      kind: 'visit',
      label:
        [row.projectCode, row.taskTitle ?? row.serviceLabel].filter(Boolean).join(' · ') ||
        'Site visit',
      at: row.visit.checkInAt.toISOString(),
      point: point(row.visit.checkInLatitude, row.visit.checkInLongitude),
    });
  return {
    dayId: day?.day.id ?? null,
    closed: Boolean(day?.day.checkOutAt),
    stops: orderStops(stops),
    visits: visits.length,
    window: day ? { from: day.day.checkInAt, to: day.day.checkOutAt } : null,
    cleared:
      Boolean(day?.day.locationClearedAt) ||
      visits.some((row) => row.visit.locationClearedAt !== null),
  };
}
