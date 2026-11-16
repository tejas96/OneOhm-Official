import {
  type GeoPoint,
  keptEnds,
  nearestLocation,
  orderStops,
  type RoutePoint,
  type TravelStop,
  type WorkLocation,
} from '@oneohm/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { serviceCategories } from './schema/after-sales.schema';
import { serviceRequests } from './schema/customer-portal.schema';
import { dutyPoints } from './schema/duty-points.schema';
import { personWorkSettings } from './schema/engagement.schema';
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
  /** Where the duty started (check-in position, else the first kept route point), or null. */
  readonly start: GeoPoint | null;
  /** Where the duty ended (check-out position, else the last kept route point), or null. */
  readonly end: GeoPoint | null;
  /** The day's route points in time order, used or not. */
  readonly route: RoutePoint[];
  readonly visits: number;
  /** Some of the day's coordinates were already cleared by the retention sweep. */
  readonly cleared: boolean;
  /** Check-in and check-out, for the silence at either end of the route. */
  readonly window: { readonly from: Date; readonly to: Date | null } | null;
}

export async function activePlaces(db: DatabaseExecutor): Promise<WorkLocation[]> {
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

/** The day's recorded route points in time order (empty when none was recorded or kept). */
export async function readRoute(db: DatabaseExecutor, dayId: string | null) {
  if (!dayId) return [];
  return db
    .select({
      recordedAt: dutyPoints.recordedAt,
      latitude: dutyPoints.latitude,
      longitude: dutyPoints.longitude,
      accuracyM: dutyPoints.accuracyM,
      mocked: dutyPoints.mocked,
    })
    .from(dutyPoints)
    .where(eq(dutyPoints.attendanceDayId, dayId))
    .orderBy(asc(dutyPoints.recordedAt), asc(dutyPoints.id));
}

/** The person's saved base place (home), or null when none is saved. */
export async function readBase(db: DatabaseExecutor, userId: string): Promise<GeoPoint | null> {
  const [row] = await db
    .select({
      latitude: personWorkSettings.baseLatitude,
      longitude: personWorkSettings.baseLongitude,
    })
    .from(personWorkSettings)
    .where(eq(personWorkSettings.userId, userId))
    .limit(1);
  return row ? point(row.latitude, row.longitude) : null;
}

type Day = typeof attendanceDays.$inferSelect;

const asPoint = (point: RoutePoint | null): GeoPoint | null =>
  point ? { latitude: point.latitude, longitude: point.longitude } : null;

/**
 * The day's start and end stops. Travel is paid from where the duty starts, so both are kept
 * wherever they are, inside an office fence or not. No position at the tap: the route's first
 * and last kept points stand in. The review judges the start (`startPlaceCheck`).
 */
async function dayEnds(
  db: DatabaseExecutor,
  day: Day,
  place: string | null,
  route: readonly RoutePoint[],
): Promise<{ stops: TravelStop[]; start: GeoPoint | null; end: GeoPoint | null }> {
  const ends = keptEnds(route);
  const stops: TravelStop[] = [];
  const checkIn = point(day.checkInLatitude, day.checkInLongitude);
  const start = checkIn ?? asPoint(ends.first);
  if (start)
    stops.push({
      id: 'start',
      kind: 'start',
      label: checkIn ? (place ?? 'Check-in') : 'Duty start',
      at: (checkIn ? day.checkInAt : (ends.first?.recordedAt ?? day.checkInAt)).toISOString(),
      point: start,
    });
  const checkOut = point(day.checkOutLatitude, day.checkOutLongitude);
  const end = checkOut ?? asPoint(ends.last);
  if (end && day.checkOutAt)
    stops.push({
      id: 'end',
      kind: 'end',
      label: await endLabel(db, checkOut),
      at: day.checkOutAt.toISOString(),
      point: end,
    });
  return { stops, start, end: day.checkOutAt ? end : null };
}

/** An office name when the check-out was inside one, else "Check-out" (or "Duty end" with no position). */
async function endLabel(db: DatabaseExecutor, checkOut: GeoPoint | null): Promise<string> {
  if (!checkOut) return 'Duty end';
  const match = nearestLocation(checkOut, await activePlaces(db));
  return match?.inside ? match.location.name : 'Check-out';
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
  const route = day ? await readRoute(db, day.day.id) : [];
  const {
    stops,
    start: startPoint,
    end: endPoint,
  } = day
    ? await dayEnds(db, day.day, day.place, route)
    : { stops: [] as TravelStop[], start: null, end: null };
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
    start: startPoint,
    end: endPoint,
    route,
    visits: visits.length,
    window: day ? { from: day.day.checkInAt, to: day.day.checkOutAt } : null,
    cleared:
      Boolean(day?.day.locationClearedAt) ||
      visits.some((row) => row.visit.locationClearedAt !== null),
  };
}
