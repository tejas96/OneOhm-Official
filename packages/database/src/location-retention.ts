import { locationCutoff, type WorkforcePolicy, withPolicyDefaults } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { businessTimeZone } from './business-calendar';
import type { DatabaseExecutor } from './client';
import { documentGeotags, siteVisits, travelDays } from './schema/site-activity.schema';
import { attendanceDays, workforcePolicy } from './schema/workforce.schema';
import { takeTravelSnapshot } from './travel-snapshot';

export interface ClearedLocations {
  readonly attendanceDays: number;
  readonly siteVisits: number;
  readonly photos: number;
}

async function retentionDays(db: DatabaseExecutor): Promise<number> {
  const [row] = await db
    .select({ policy: workforcePolicy.policy })
    .from(workforcePolicy)
    .where(eq(workforcePolicy.id, 'default'))
    .limit(1);
  const policy: WorkforcePolicy = withPolicyDefaults(row?.policy);
  return policy.attendance.retentionDays;
}

/**
 * Safety net (live review S4): a closed day about to lose its coordinates that has no
 * saved travel yet gets it saved first, so the day is never worth less than it was. Day
 * close saves it already; this covers days closed before that existed.
 */
async function saveUnsavedTravel(db: DatabaseExecutor, before: string, now: Date): Promise<number> {
  const unsaved = await db
    .select({ userId: attendanceDays.userId, workDate: attendanceDays.workDate })
    .from(attendanceDays)
    .leftJoin(
      travelDays,
      and(
        eq(travelDays.userId, attendanceDays.userId),
        eq(travelDays.workDate, attendanceDays.workDate),
      ),
    )
    .where(
      and(
        lt(attendanceDays.workDate, before),
        isNull(attendanceDays.locationClearedAt),
        isNotNull(attendanceDays.checkOutAt),
        isNull(travelDays.id),
      ),
    );
  for (const day of unsaved)
    await takeTravelSnapshot(db, day.userId, day.workDate, now, 'backfill');
  return unsaved.length;
}

/**
 * Clears raw coordinates older than the retention period in Settings (PRD 4.3,
 * privacy): day check-ins, site check-ins and photo geotags. Times, distances and the
 * far-from-site flags stay, so attendance, visits and travel claims still read right.
 * Safe to run any number of times; the daily worker job runs it every morning.
 */
export async function clearExpiredLocations(
  db: DatabaseExecutor,
  today: string = todayIn(),
): Promise<ClearedLocations> {
  const before = locationCutoff(today, await retentionDays(db));
  const now = new Date();
  await saveUnsavedTravel(db, before, now);
  const days = await db
    .update(attendanceDays)
    .set({
      checkInLatitude: null,
      checkInLongitude: null,
      checkInAccuracyM: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkOutAccuracyM: null,
      locationClearedAt: now,
    })
    .where(and(lt(attendanceDays.workDate, before), isNull(attendanceDays.locationClearedAt)))
    .returning({ id: attendanceDays.id });
  const visits = await db
    .update(siteVisits)
    .set({
      checkInLatitude: null,
      checkInLongitude: null,
      checkInAccuracyM: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkOutAccuracyM: null,
      locationClearedAt: now,
      updatedAt: now,
    })
    .where(and(lt(siteVisits.workDate, before), isNull(siteVisits.locationClearedAt)))
    .returning({ id: siteVisits.id });
  const photos = await db
    .update(documentGeotags)
    .set({ latitude: null, longitude: null, accuracyM: null, locationClearedAt: now })
    .where(
      and(
        isNull(documentGeotags.locationClearedAt),
        lt(
          sql`(coalesce(${documentGeotags.capturedAt}, ${documentGeotags.createdAt}) at time zone ${businessTimeZone()})::date`,
          before,
        ),
      ),
    )
    .returning({ id: documentGeotags.documentId });
  return { attendanceDays: days.length, siteVisits: visits.length, photos: photos.length };
}
