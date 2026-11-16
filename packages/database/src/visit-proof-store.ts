import { AUTO_RESOLVED_REASON, type RoutePoint, type VisitProof, visitProof } from '@oneohm/domain';
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { businessTimeZone } from './business-calendar';
import type { DatabaseExecutor } from './client';
import { personName, raiseDutyAlert, resolveDutyAlerts } from './duty-alert-store';
import { trackingStates } from './duty-tracking';
import { properties } from './schema/crm.schema';
import { dutyAlerts } from './schema/duty-alerts.schema';
import { dutyPoints } from './schema/duty-points.schema';
import { projectTasks } from './schema/projects.schema';
import { documents } from './schema/records.schema';
import { documentGeotags, siteVisits } from './schema/site-activity.schema';
import { currentWorkforcePolicy } from './travel-snapshot';

type VisitRow = typeof siteVisits.$inferSelect;

/** A photo up to this long after the check-out still belongs to the visit. */
const PHOTO_AFTER_MS = 5 * 60_000;

/** The visit's photos (by its person, on its task or request, taken during it), near or far. */
async function visitPhotos(db: DatabaseExecutor, visit: VisitRow, until: Date) {
  const work = visit.taskId
    ? eq(documents.taskId, visit.taskId)
    : visit.serviceRequestId
      ? eq(documents.serviceRequestId, visit.serviceRequestId)
      : null;
  if (!work) return [];
  const taken = sql`coalesce(${documentGeotags.capturedAt}, ${documents.createdAt})`;
  const rows = await db
    .select({ far: documentGeotags.farFromSite })
    .from(documents)
    .innerJoin(documentGeotags, eq(documentGeotags.documentId, documents.id))
    .where(
      and(
        work,
        eq(documents.uploadedByUserId, visit.userId),
        isNull(documents.removedAt),
        gte(taken, visit.checkInAt),
        lte(taken, new Date(until.getTime() + PHOTO_AFTER_MS)),
      ),
    );
  return rows;
}

/** The words for a doubtful visit's alert: the job and where. */
async function jobWords(db: DatabaseExecutor, visit: VisitRow): Promise<string> {
  const [row] = visit.taskId
    ? await db
        .select({ title: projectTasks.title })
        .from(projectTasks)
        .where(eq(projectTasks.id, visit.taskId))
    : [];
  return row?.title ?? (visit.kind === 'service' ? 'Service visit' : 'Site visit');
}

/**
 * Whether the phone was expected to send its route during the visit: location switched on
 * for the person, consent to the current words given before the visit began, and the visit
 * began within the hours location is read.
 */
async function routeExpected(db: DatabaseExecutor, visit: VisitRow): Promise<boolean> {
  const tracking = (
    await trackingStates(db, [visit.userId], visit.checkInAt, businessTimeZone())
  ).get(visit.userId);
  if (tracking?.state !== 'on' || !tracking.consentedAt) return false;
  return tracking.consentedAt.getTime() <= visit.checkInAt.getTime();
}

export interface SettleOptions {
  /** False to work the proof out quietly (the first run's catch-up): nobody is told. */
  readonly notify?: boolean;
  /** The person's points around the visit, already read by the caller (the upload). */
  readonly points?: readonly RoutePoint[];
}

/**
 * Works out a closed visit's proof (`visitProof`) and saves it on the visit, with when. A
 * doubtful one raises `visit_doubtful` for the person's manager (once per visit); one that
 * turns verified (late points) closes that alert by itself. With no route expected for the
 * person, missing points prove nothing either way. Called at every check-out path, again
 * when late route points reach the visit's time, and by the five-minute sweep for any closed
 * visit of today still without one. Returns null for an open visit.
 */
export async function settleVisitProof(
  db: DatabaseExecutor,
  visitId: string,
  now: Date = new Date(),
  options: SettleOptions = {},
): Promise<VisitProof | null> {
  const [visit] = await db.select().from(siteVisits).where(eq(siteVisits.id, visitId)).limit(1);
  if (!visit?.checkOutAt) return null;
  const checkOutAt = visit.checkOutAt;
  const [policy, site, points, photos, trackingExpected] = await Promise.all([
    currentWorkforcePolicy(db),
    visit.propertyId
      ? db
          .select({ latitude: properties.latitude, longitude: properties.longitude })
          .from(properties)
          .where(eq(properties.id, visit.propertyId))
          .then((rows) => rows[0] ?? null)
      : null,
    options.points
      ? options.points.filter(
          (point) => point.recordedAt >= visit.checkInAt && point.recordedAt <= checkOutAt,
        )
      : db
          .select()
          .from(dutyPoints)
          .where(
            and(
              eq(dutyPoints.userId, visit.userId),
              gte(dutyPoints.recordedAt, visit.checkInAt),
              lte(dutyPoints.recordedAt, checkOutAt),
            ),
          )
          .orderBy(asc(dutyPoints.recordedAt)),
    visitPhotos(db, visit, checkOutAt),
    routeExpected(db, visit),
  ]);
  const pin =
    site && site.latitude !== null && site.longitude !== null
      ? { latitude: site.latitude, longitude: site.longitude }
      : null;
  const result = visitProof({
    checkInAt: visit.checkInAt,
    checkOutAt: visit.checkOutAt,
    site: pin,
    radiusM: policy.travel.siteFenceM,
    points,
    checkInLocated: visit.checkInLatitude !== null || visit.checkInDistanceM !== null,
    checkInFar: visit.checkInFar,
    photos,
    trackingExpected,
  });
  await db
    .update(siteVisits)
    .set({ proof: result.proof, proofReasons: [...result.reasons], proofAt: now })
    .where(eq(siteVisits.id, visit.id));
  if (result.proof === 'verified') await closeDoubtful(db, visit.id, now);
  if (result.proof === 'doubtful') {
    const job = await jobWords(db, visit);
    await raiseDutyAlert(
      db,
      {
        kind: 'visit_doubtful',
        personId: visit.userId,
        subjectType: 'site_visit',
        subjectId: visit.id,
        day: visit.workDate,
        title: `${await personName(db, visit.userId)}: visit doubtful`,
        body: `${job}: ${result.reasons.join(', ').replaceAll('_', ' ')}.`,
        detail: { visitId: visit.id, label: job, reasons: result.reasons.join(',') },
        ...(visit.taskId
          ? { opens: { type: 'task' as const, id: visit.taskId, projectId: visit.projectId } }
          : visit.serviceRequestId
            ? { opens: { type: 'service_request' as const, id: visit.serviceRequestId } }
            : {}),
      },
      { notify: options.notify ?? true },
    );
  }
  return result;
}

/** The visit's open `visit_doubtful` alert closes by itself once the proof is verified. */
async function closeDoubtful(db: DatabaseExecutor, visitId: string, now: Date): Promise<void> {
  const open = await db
    .select({ id: dutyAlerts.id })
    .from(dutyAlerts)
    .where(
      and(
        eq(dutyAlerts.kind, 'visit_doubtful'),
        eq(dutyAlerts.subjectId, visitId),
        isNull(dutyAlerts.resolvedAt),
      ),
    );
  await resolveDutyAlerts(
    db,
    open.map((row) => row.id),
    AUTO_RESOLVED_REASON,
    now,
  );
}
