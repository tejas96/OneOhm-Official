import {
  CAP_MIN_STRAIGHT_M,
  reviewTravelDay,
  travelAmountPaise,
  type WorkforcePolicy,
} from '@oneohm/domain';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { siteVisits, travelClaims, type travelDays } from './schema/site-activity.schema';
import { attendanceDays, leaveRequests } from './schema/workforce.schema';

type Snapshot = typeof travelDays.$inferSelect;

/** A claim the system or the person has not taken back: the ones that still count for the day. */
export const notWithdrawn = isNull(travelClaims.withdrawnByResumeAt);

/** The project with the most site visits that day; on a tie, the first visit's. */
export function busiestProject(
  visits: readonly { projectId: string | null; checkInAt: Date }[],
): string | null {
  const counts = new Map<string, { count: number; first: number }>();
  for (const visit of visits) {
    if (!visit.projectId) continue;
    const seen = counts.get(visit.projectId);
    const at = visit.checkInAt.getTime();
    counts.set(visit.projectId, {
      count: (seen?.count ?? 0) + 1,
      first: Math.min(seen?.first ?? at, at),
    });
  }
  let best: { id: string; count: number; first: number } | null = null;
  for (const [id, entry] of counts)
    if (
      !best ||
      entry.count > best.count ||
      (entry.count === best.count && entry.first < best.first)
    )
      best = { id, ...entry };
  return best?.id ?? null;
}

/**
 * What the day says about how far its km can be trusted (Duty Day step 2), from the saved
 * travel and the live day. A claim the person made is read with automatic approval taken as
 * on, so `auto_approve_off` is not listed against it: it was never going to be automatic.
 */
export async function reviewDayClaim(
  db: DatabaseExecutor,
  snap: Snapshot,
  policy: WorkforcePolicy,
  manual = false,
) {
  const [visits, [day], leave] = await Promise.all([
    db
      .select({
        projectId: siteVisits.projectId,
        checkInAt: siteVisits.checkInAt,
        far: siteVisits.checkInFar,
        latitude: siteVisits.checkInLatitude,
        cleared: siteVisits.locationClearedAt,
      })
      .from(siteVisits)
      .where(and(eq(siteVisits.userId, snap.userId), eq(siteVisits.workDate, snap.workDate)))
      .orderBy(asc(siteVisits.checkInAt)),
    db
      .select({
        autoClosedAt: attendanceDays.autoClosedAt,
        tapDelayed: attendanceDays.tapDelayed,
        checkInInside: attendanceDays.checkInInside,
        checkOutInside: attendanceDays.checkOutInside,
      })
      .from(attendanceDays)
      .where(
        and(eq(attendanceDays.userId, snap.userId), eq(attendanceDays.workDate, snap.workDate)),
      )
      .limit(1),
    db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.userId, snap.userId),
          eq(leaveRequests.status, 'approved'),
          lte(leaveRequests.fromDate, snap.workDate),
          gte(leaveRequests.toDate, snap.workDate),
        ),
      )
      .limit(1),
  ]);
  const amountPaise = travelAmountPaise(snap.paidM, snap.ratePaisePerKm);
  const route = snap.method === 'route';
  const review = reviewTravelDay(
    {
      method: snap.method,
      gapMinutes: snap.gapMinutes,
      mockedCount: snap.mockedCount,
      capApplied: snap.capApplied,
      noVisits: snap.visits === 0,
      uncappedRoute: route && snap.visits > 0 && snap.straightM < CAP_MIN_STRAIGHT_M,
      shortRoute: route && snap.routeM < snap.straightM,
      startOutsideOffice: day?.checkInInside === false,
      endOutsideOffice: day?.checkOutInside === false,
      farCheckIns: visits.filter((visit) => visit.far === true).length,
      // A visit whose coordinates were cleared by retention did have a location.
      unlocatedVisits: visits.filter((visit) => visit.latitude === null && !visit.cleared).length,
      autoClosed: Boolean(day?.autoClosedAt),
      delayedTap: Boolean(day?.tapDelayed),
      paidM: snap.paidM,
      amountPaise,
      onLeave: leave.length > 0,
    },
    manual ? { ...policy.travel, autoApprove: true } : policy.travel,
  );
  return { review, projectId: busiestProject(visits), amountPaise };
}

export const sameReasons = (left: readonly string[] | null, right: readonly string[]): boolean =>
  (left ?? []).join() === right.join();
