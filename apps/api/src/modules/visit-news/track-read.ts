import type { TrackView } from '@oneohm/api-contracts';
import { attendanceDays, type DatabaseExecutor, dutyPoints, siteVisits } from '@oneohm/database';
import { distanceMeters, ROUTE_MAX_ACCURACY_M, visitEtaMinutes } from '@oneohm/domain';
import { and, desc, eq, isNull, lte, or } from 'drizzle-orm';
import type { Environment } from '../../config/environment';
import { browserKeyFrom } from '../maps/maps.controller';
import { assistantLanguage } from '../whatsapp/assistant/language';
import { readTrackToken, type TrackToken, trackSecret, trackSharing } from './track-token';
import { jobTarget, workerFirstName } from './visit-news-target';

type TrackEnv = Pick<
  Environment,
  | 'FILE_LINK_SECRET'
  | 'TRACK_LINK_SECRET'
  | 'GOOGLE_MAPS_BROWSER_KEY'
  | 'GOOGLE_MAPS_API_KEY'
  | 'GOOGLE_MAPS_MAP_ID'
>;

/** Where the visit stands: the worker checked in (`arrived`), or it is over (`ended`); null before. */
async function visitState(db: DatabaseExecutor, token: TrackToken) {
  const [visit] = await db
    .select({ out: siteVisits.checkOutAt })
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.userId, token.workerId),
        eq(siteVisits.workDate, token.day),
        token.service
          ? eq(siteVisits.serviceRequestId, token.jobId)
          : eq(siteVisits.taskId, token.jobId),
      ),
    )
    .orderBy(desc(siteVisits.checkInAt))
    .limit(1);
  if (!visit) return null;
  return visit.out ? ('ended' as const) : ('arrived' as const);
}

/** The worker's newest usable point of that day, while the day is still open; null otherwise. */
async function latestPoint(db: DatabaseExecutor, token: TrackToken) {
  const [day] = await db
    .select({ id: attendanceDays.id })
    .from(attendanceDays)
    .where(
      and(
        eq(attendanceDays.userId, token.workerId),
        eq(attendanceDays.workDate, token.day),
        isNull(attendanceDays.checkOutAt),
      ),
    )
    .limit(1);
  if (!day) return null;
  const [point] = await db
    .select()
    .from(dutyPoints)
    .where(
      and(
        eq(dutyPoints.attendanceDayId, day.id),
        eq(dutyPoints.mocked, false),
        or(isNull(dutyPoints.accuracyM), lte(dutyPoints.accuracyM, ROUTE_MAX_ACCURACY_M)),
      ),
    )
    .orderBy(desc(dutyPoints.recordedAt))
    .limit(1);
  return { point: point ?? null };
}

/**
 * The customer's "Track live" page (Duty Day step 6), by its signed link. The worker's position is
 * shared only while they are on the way: once they check in, the visit ends, their day ends, or
 * 3 hours after the link was made, there is no position. Null when the link cannot be read.
 */
export async function readTrack(
  db: DatabaseExecutor,
  env: TrackEnv,
  value: string,
  now: Date = new Date(),
): Promise<TrackView | null> {
  const token = readTrackToken(trackSecret(env), value, now.getTime());
  if (!token) return null;
  const target = await jobTarget(db, {
    taskId: token.service ? null : token.jobId,
    serviceRequestId: token.service ? token.jobId : null,
  });
  if (!target) return null;
  const base = {
    workerName: await workerFirstName(db, token.workerId),
    homeLabel: target.home,
    home: target.site,
    language: assistantLanguage(target.language),
    maps: { browserKey: browserKeyFrom(env), mapId: env.GOOGLE_MAPS_MAP_ID ?? null },
  };
  const none = { worker: null, minutes: null, updatedAt: null };
  const reached = await visitState(db, token);
  if (reached) return { ...base, ...none, state: reached };
  const open = trackSharing(token, now.getTime()) ? await latestPoint(db, token) : null;
  if (!open) return { ...base, ...none, state: 'ended' };
  const { point } = open;
  const worker = point ? { latitude: point.latitude, longitude: point.longitude } : null;
  return {
    ...base,
    state: 'on_way',
    worker,
    minutes: worker && target.site ? visitEtaMinutes(distanceMeters(worker, target.site)) : null,
    updatedAt: point ? point.recordedAt.toISOString() : null,
  };
}
