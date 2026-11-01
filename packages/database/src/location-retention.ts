import { locationCutoff, type WorkforcePolicy, withPolicyDefaults } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { documentGeotags, siteVisits } from './schema/site-activity.schema';
import { attendanceDays, workforcePolicy } from './schema/workforce.schema';

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
          sql`(coalesce(${documentGeotags.capturedAt}, ${documentGeotags.createdAt}) at time zone 'Asia/Kolkata')::date`,
          before,
        ),
      ),
    )
    .returning({ id: documentGeotags.documentId });
  return { attendanceDays: days.length, siteVisits: visits.length, photos: photos.length };
}
