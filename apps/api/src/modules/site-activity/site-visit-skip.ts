import { type DatabaseExecutor, dutyPoints, siteVisits } from '@oneohm/database';
import {
  type AutoSkip,
  ambiguousSitesAt,
  distanceMeters,
  type GeoPoint,
  keptRoutePoint,
  ROUTE_LEAVE_MARGIN_M,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import { currentCalendar } from '../../common/calendar';
import { loadPolicy } from '../workforce/policy';
import type { Position } from '../workforce/tracking';
import { dutySitesFor } from './duty-sites.service';
import { alreadyVisiting } from './site-visit-auto';

type Subject = { readonly taskId: string } | { readonly serviceRequestId: string };

/**
 * Whether an automatic check-in (the phone's fence or the route) is to be left alone, with no
 * error for the phone (Duty Day step 3):
 * - `must_leave_first`: the person already had a visit at this job today that closed, and no
 *   kept route point beyond the fence and its margin has been recorded since, so they may
 *   still be standing at the site;
 * - `ambiguous_site`: the reading is within the fence of two of today's sites whose pins are
 *   less than two radii apart, so which job they are at is for the person to say.
 */
export async function autoCheckInSkip(
  db: DatabaseExecutor,
  userId: string,
  subject: Subject,
  site: GeoPoint | null,
  position: Position | null | undefined,
  at: Date,
): Promise<AutoSkip | null> {
  const workDate = todayIn(currentCalendar().timeZone, at);
  const { travel } = await loadPolicy(db);
  const [closed] = await db
    .select({ at: siteVisits.checkOutAt })
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.userId, userId),
        eq(siteVisits.workDate, workDate),
        isNotNull(siteVisits.checkOutAt),
        'taskId' in subject
          ? eq(siteVisits.taskId, subject.taskId)
          : eq(siteVisits.serviceRequestId, subject.serviceRequestId),
      ),
    )
    .orderBy(desc(siteVisits.checkOutAt))
    .limit(1);
  if (closed?.at && site) {
    const points = await db
      .select({
        recordedAt: dutyPoints.recordedAt,
        latitude: dutyPoints.latitude,
        longitude: dutyPoints.longitude,
        accuracyM: dutyPoints.accuracyM,
        mocked: dutyPoints.mocked,
      })
      .from(dutyPoints)
      .where(and(eq(dutyPoints.userId, userId), gt(dutyPoints.recordedAt, closed.at)));
    const left = points.some(
      (point) =>
        keptRoutePoint(point) &&
        distanceMeters(point, site) > travel.siteFenceM + ROUTE_LEAVE_MARGIN_M,
    );
    if (!left) return 'must_leave_first';
  }
  if (position) {
    const id = 'taskId' in subject ? subject.taskId : subject.serviceRequestId;
    const sites = await dutySitesFor(db, userId, workDate);
    if (ambiguousSitesAt(position, sites).some((one) => one.id === id)) return 'ambiguous_site';
  }
  return null;
}

/**
 * Whether an automatic check-in does nothing: the person already has this visit (the phone and
 * the route saw the same arrival), or `autoCheckInSkip` says to leave it. Null when it goes
 * ahead; otherwise the reason to give back, null for a visit that already exists.
 */
export async function holdAutoCheckIn(
  db: DatabaseExecutor,
  userId: string,
  subject: Subject,
  site: GeoPoint | null,
  position: Position | null | undefined,
  at: Date,
): Promise<{ autoSkipped: AutoSkip | null } | null> {
  if (await alreadyVisiting(db, userId, subject, at)) return { autoSkipped: null };
  const autoSkipped = await autoCheckInSkip(db, userId, subject, site, position, at);
  return autoSkipped ? { autoSkipped } : null;
}
