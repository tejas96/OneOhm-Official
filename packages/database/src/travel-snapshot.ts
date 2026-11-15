import {
  type GeoPoint,
  nearestLocation,
  orderStops,
  summariseTravel,
  type TravelStop,
  type WorkLocation,
  withPolicyDefaults,
} from '@oneohm/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { serviceCategories } from './schema/after-sales.schema';
import { serviceRequests } from './schema/customer-portal.schema';
import { projects, projectTasks } from './schema/projects.schema';
import { siteVisits, travelDays } from './schema/site-activity.schema';
import { attendanceDays, workforcePolicy, workLocations } from './schema/workforce.schema';

const point = (latitude: number | null, longitude: number | null): GeoPoint | null =>
  latitude !== null && longitude !== null ? { latitude, longitude } : null;

export interface TravelFacts {
  /** The person's attendance day has a check-out: person, night job or correction. */
  readonly closed: boolean;
  /** The day's stops in order, with a point only where one was kept. */
  readonly stops: TravelStop[];
  readonly visits: number;
  /** Some of the day's coordinates were already cleared by the retention sweep. */
  readonly cleared: boolean;
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
    if (start && day.day.checkInInside && day.place)
      stops.push({
        id: 'start',
        kind: 'start',
        label: day.place,
        at: day.day.checkInAt.toISOString(),
        point: start,
      });
    const end = point(day.day.checkOutLatitude, day.day.checkOutLongitude);
    if (end && day.day.checkOutAt && day.day.checkOutInside) {
      const place = nearestLocation(end, await activePlaces(db));
      stops.push({
        id: 'end',
        kind: 'end',
        label: place?.location.name ?? day.place ?? 'Check-out',
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
    closed: Boolean(day?.day.checkOutAt),
    stops: orderStops(stops),
    visits: visits.length,
    cleared:
      Boolean(day?.day.locationClearedAt) ||
      visits.some((row) => row.visit.locationClearedAt !== null),
  };
}

export type TravelDaySnapshot = typeof travelDays.$inferSelect;

export async function readTravelSnapshot(
  db: DatabaseExecutor,
  userId: string,
  workDate: string,
): Promise<TravelDaySnapshot | null> {
  const [row] = await db
    .select()
    .from(travelDays)
    .where(and(eq(travelDays.userId, userId), eq(travelDays.workDate, workDate)))
    .limit(1);
  return row ?? null;
}

/** Forgets the saved day, when the person takes their End duty back (live review A10). */
export async function dropTravelSnapshot(
  db: DatabaseExecutor,
  userId: string,
  workDate: string,
): Promise<void> {
  await db
    .delete(travelDays)
    .where(and(eq(travelDays.userId, userId), eq(travelDays.workDate, workDate)));
}

async function currentRate(db: DatabaseExecutor): Promise<number> {
  const [row] = await db
    .select({ policy: workforcePolicy.policy })
    .from(workforcePolicy)
    .where(eq(workforcePolicy.id, 'default'))
    .limit(1);
  return withPolicyDefaults(row?.policy).travel.ratePaisePerKm;
}

/**
 * Saves the day's travel (live review S3, S4): distance, legs, visit count and the km
 * rate in force that day. Called when a day closes (End duty, the night job, an approved
 * correction) and again if it closes again; a day saved before keeps its rate. A day closed
 * before snapshots existed is saved later with `source: 'backfill'`, so it can be told apart. Does
 * nothing, returning null, for a day that is not closed, so a running day is never saved.
 */
export async function takeTravelSnapshot(
  db: DatabaseExecutor,
  userId: string,
  workDate: string,
  now: Date = new Date(),
  source: 'close' | 'backfill' = 'close',
): Promise<TravelDaySnapshot | null> {
  const facts = await readTravelFacts(db, userId, workDate);
  if (!facts.closed) return null;
  const saved = await readTravelSnapshot(db, userId, workDate);
  // Measuring again from cleared coordinates would shrink a day that was saved in full.
  if (saved && facts.cleared) return saved;
  const rate = saved?.ratePaisePerKm ?? (await currentRate(db));
  const summary = summariseTravel(facts.stops, rate, facts.visits);
  const values = {
    userId,
    workDate,
    distanceM: summary.distanceM,
    ratePaisePerKm: summary.ratePaisePerKm,
    legs: summary.legs.map((leg) => ({ ...leg })),
    visits: summary.visits,
    computedAt: now,
    source,
  };
  const [row] = await db
    .insert(travelDays)
    .values(values)
    .onConflictDoUpdate({
      target: [travelDays.userId, travelDays.workDate],
      set: {
        distanceM: values.distanceM,
        ratePaisePerKm: values.ratePaisePerKm,
        legs: values.legs,
        visits: values.visits,
        computedAt: now,
      },
    })
    .returning();
  return row ?? null;
}

/** The saved day, made first if the day is closed and nothing was saved yet. */
export async function ensureTravelSnapshot(
  db: DatabaseExecutor,
  userId: string,
  workDate: string,
): Promise<TravelDaySnapshot | null> {
  return (
    (await readTravelSnapshot(db, userId, workDate)) ??
    takeTravelSnapshot(db, userId, workDate, new Date(), 'backfill')
  );
}
