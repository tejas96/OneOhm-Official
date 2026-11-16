import {
  CAP_MIN_STRAIGHT_M,
  type GeoPoint,
  reviewTravelDay,
  startPlaceCheck,
  travelAmountPaise,
  type WorkforcePolicy,
} from '@oneohm/domain';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { siteVisits, travelClaims, type travelDays } from './schema/site-activity.schema';
import { attendanceDays, leaveRequests } from './schema/workforce.schema';
import { activePlaces, readBase, readTravelFacts } from './travel-facts';

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
 * Where the duty started and ended against the person's base and the offices. A day with
 * visits but no start (or end) position is 'missing'. A day with no visits, or whose
 * coordinates the retention sweep already cleared, has nothing to judge.
 */
async function dutyPlaces(db: DatabaseExecutor, snap: Snapshot, policy: WorkforcePolicy) {
  if (snap.visits === 0) return {};
  const facts = await readTravelFacts(db, snap.userId, snap.workDate);
  if (facts.cleared) return {};
  const [base, offices] =
    facts.start || facts.end
      ? await Promise.all([readBase(db, snap.userId), activePlaces(db)])
      : [null, []];
  const judge = (place: GeoPoint | null) =>
    place
      ? startPlaceCheck({ start: place, base, offices, maxKm: policy.travel.baseStartMaxKm })
      : ('missing' as const);
  return { startPlace: judge(facts.start), endPlace: judge(facts.end) };
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
  const [visits, [day], leave, places] = await Promise.all([
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
    dutyPlaces(db, snap, policy),
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
      ...places,
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
