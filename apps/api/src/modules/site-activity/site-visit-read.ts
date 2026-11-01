import type { SiteVisit } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  projects,
  projectTasks,
  properties,
  serviceCategories,
  serviceRequests,
  siteVisits,
  users,
} from '@oneohm/database';
import type { GeoPoint } from '@oneohm/domain';
import { desc, eq, type SQL } from 'drizzle-orm';

type VisitRow = typeof siteVisits.$inferSelect;

export interface VisitWithSite {
  readonly row: VisitRow;
  readonly record: SiteVisit;
  /** The site's saved location, when it has one. */
  readonly site: GeoPoint | null;
}

const minutesBetween = (from: Date, to: Date | null) =>
  to ? Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000)) : null;

/** The site check-in point, while the coordinates are still kept. */
export function checkInPoint(row: VisitRow): GeoPoint | null {
  return row.checkInLatitude !== null && row.checkInLongitude !== null
    ? { latitude: row.checkInLatitude, longitude: row.checkInLongitude }
    : null;
}

function locationNote(row: VisitRow, siteLocated: boolean): SiteVisit['locationNote'] {
  if (row.checkInDistanceM !== null) return null;
  // Located, but there was no saved site to measure against.
  if (row.checkInLatitude !== null) return 'site_unknown';
  if (row.locationClearedAt && !siteLocated) return 'site_unknown';
  return 'not_shared';
}

/** Visits with who made them, the task and project, and the site, newest first. */
export async function readVisits(db: DatabaseExecutor, where: SQL): Promise<VisitWithSite[]> {
  const rows = await db
    .select({
      visit: siteVisits,
      fullName: users.fullName,
      taskTitle: projectTasks.title,
      serviceLabel: serviceCategories.label,
      projectCode: projects.code,
      siteLabel: properties.label,
      siteLatitude: properties.latitude,
      siteLongitude: properties.longitude,
    })
    .from(siteVisits)
    .innerJoin(users, eq(users.id, siteVisits.userId))
    .leftJoin(projectTasks, eq(projectTasks.id, siteVisits.taskId))
    .leftJoin(serviceRequests, eq(serviceRequests.id, siteVisits.serviceRequestId))
    .leftJoin(serviceCategories, eq(serviceCategories.key, serviceRequests.category))
    .leftJoin(projects, eq(projects.id, siteVisits.projectId))
    .leftJoin(properties, eq(properties.id, siteVisits.propertyId))
    .where(where)
    .orderBy(desc(siteVisits.checkInAt));
  return rows.map((entry) => {
    const row = entry.visit;
    const site =
      entry.siteLatitude !== null && entry.siteLongitude !== null
        ? { latitude: entry.siteLatitude, longitude: entry.siteLongitude }
        : null;
    return {
      row,
      site,
      record: {
        id: row.id,
        user: { id: row.userId, fullName: entry.fullName },
        kind: row.kind,
        taskId: row.taskId,
        taskTitle: entry.taskTitle ?? entry.serviceLabel,
        serviceRequestId: row.serviceRequestId,
        projectId: row.projectId,
        projectCode: entry.projectCode,
        siteLabel: entry.siteLabel,
        workDate: row.workDate,
        checkInAt: row.checkInAt.toISOString(),
        checkOutAt: row.checkOutAt?.toISOString() ?? null,
        durationMinutes: minutesBetween(row.checkInAt, row.checkOutAt),
        checkInDistanceM: row.checkInDistanceM,
        checkOutDistanceM: row.checkOutDistanceM,
        farFromSite: row.checkInFar,
        leftFarFromSite: row.checkOutFar,
        locationNote: locationNote(row, site !== null),
        locationCleared: row.locationClearedAt !== null,
      },
    };
  });
}

export const visitRecords = async (db: DatabaseExecutor, where: SQL) =>
  (await readVisits(db, where)).map((item) => item.record);

/** How a visit reads in the project history: "40 m from the site", "far from the site". */
export function distanceWords(
  distanceM: number | null,
  far: boolean | null,
  located = true,
): string {
  if (distanceM === null) return located ? 'site location not saved yet' : 'location not shared';
  const amount = distanceM < 1000 ? `${distanceM} m` : `${(distanceM / 1000).toFixed(1)} km`;
  return far ? `${amount} from the site, flagged as far` : `${amount} from the site`;
}

/** "1 h 35 min", "40 min". */
export function durationWords(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
