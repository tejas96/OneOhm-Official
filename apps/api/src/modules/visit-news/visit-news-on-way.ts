import {
  attendanceDays,
  type DatabaseExecutor,
  dutyPoints,
  outbox,
  siteVisits,
} from '@oneohm/database';
import { nextJobToday, onTheWay, worksTodayAtSite } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { currentCalendar } from '../../common/calendar';
import type { Environment } from '../../config/environment';
import { siteCandidates } from '../site-activity/site-candidates';
import { loadPolicy } from '../workforce/policy';
import { signTrackToken, trackSecret } from './track-token';
import { onWayMessage } from './visit-news-messages';
import { safely, tellNews } from './visit-news-send';
import { newsTargetFor, workerFirstName } from './visit-news-target';

/** Route points this old or newer are read for the "on the way" decision, in minutes. */
const RECENT_MINUTES = 30;

type TrackEnv = Pick<Environment, 'WEB_BASE_URL' | 'FILE_LINK_SECRET' | 'TRACK_LINK_SECRET'>;

/** Someone already checked in today at these jobs. */
async function reachedToday(db: DatabaseExecutor, ids: readonly string[], today: string) {
  if (ids.length === 0) return new Set<string>();
  const rows = await db
    .select({ taskId: siteVisits.taskId, requestId: siteVisits.serviceRequestId })
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.workDate, today),
        or(inArray(siteVisits.taskId, [...ids]), inArray(siteVisits.serviceRequestId, [...ids])),
      ),
    );
  return new Set(rows.flatMap((row) => [row.taskId, row.requestId]).filter(Boolean) as string[]);
}

/** The person is on duty today (an open day) and not at a site now. */
async function onTheRoad(db: DatabaseExecutor, userId: string, today: string): Promise<boolean> {
  const [day] = await db
    .select({ id: attendanceDays.id })
    .from(attendanceDays)
    .where(
      and(
        eq(attendanceDays.userId, userId),
        eq(attendanceDays.workDate, today),
        isNull(attendanceDays.checkOutAt),
      ),
    )
    .limit(1);
  if (!day) return false;
  const [open] = await db
    .select({ id: siteVisits.id })
    .from(siteVisits)
    .where(and(eq(siteVisits.userId, userId), isNull(siteVisits.checkOutAt)))
    .limit(1);
  return !open;
}

/**
 * After a route upload (Duty Day step 6): when the person is on duty, moving, and coming closer
 * to today's next job (`nextJobToday`, `onTheWay`), its customer hears "Ravi is on the way, about
 * 15 min" with a "Track live" link. Once per job and day; nothing when the policy switch is off,
 * the task does not message its customer, or the customer said STOP.
 */
export async function tellOnTheWay(
  db: DatabaseExecutor,
  env: TrackEnv,
  userId: string,
  now: Date,
): Promise<void> {
  const policy = await loadPolicy(db);
  if (!policy.travel.customerVisitMessages) return;
  const today = todayIn(currentCalendar().timeZone, now);
  if (!(await onTheRoad(db, userId, today))) return;
  const work = (await siteCandidates(db, [userId])).filter((job) => worksTodayAtSite(job, today));
  const reached = await reachedToday(
    db,
    work.map((job) => job.id),
    today,
  );
  const next = nextJobToday(
    work.map((job) => ({
      ...job,
      planned: job.plannedDays.includes(today),
      startMin: job.startsByDay.get(today) ?? null,
      arrived: reached.has(job.id),
    })),
  );
  if (!next || next.latitude === null || next.longitude === null) return;
  const key = `worker_on_way:${next.id}:${today}`;
  const [told] = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(inArray(outbox.dedupeKey, [key, `${key}:sms`]))
    .limit(1);
  if (told) return;
  const points = await db
    .select()
    .from(dutyPoints)
    .where(
      and(
        eq(dutyPoints.userId, userId),
        gte(dutyPoints.recordedAt, new Date(now.getTime() - RECENT_MINUTES * 60_000)),
      ),
    )
    .orderBy(asc(dutyPoints.recordedAt));
  const site = { latitude: next.latitude, longitude: next.longitude };
  const way = onTheWay({
    onDuty: true,
    atSite: false,
    site,
    radiusM: policy.travel.siteFenceM,
    points,
    now,
  });
  if (!way.send) return;
  const service = next.kind === 'service';
  const target = await newsTargetFor(db, {
    taskId: service ? null : next.id,
    serviceRequestId: service ? next.id : null,
  });
  if (!target) return;
  const worker = await workerFirstName(db, userId);
  const token = signTrackToken(trackSecret(env), {
    jobId: next.id,
    service,
    workerId: userId,
    day: today,
    issuedAt: Math.floor(now.getTime() / 1000),
  });
  const given = {
    customer: target.customerName,
    worker,
    home: target.home,
    minutes: way.minutes,
    token,
    url: `${env.WEB_BASE_URL}/track/${token}`,
  };
  await safely(db, `On the way ${next.id}`, (tx) =>
    tellNews(tx, target, () => onWayMessage(given), key),
  );
}
