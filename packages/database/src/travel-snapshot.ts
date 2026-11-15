import { jobErrorText, measureDay, type WorkforcePolicy, withPolicyDefaults } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq } from 'drizzle-orm';
import { businessTimeZone } from './business-calendar';
import type { DatabaseExecutor } from './client';
import { alertJobFailed } from './job-alerts';
import { dutyPoints } from './schema/duty-points.schema';
import { auditLog } from './schema/records.schema';
import { travelDays } from './schema/site-activity.schema';
import { workforcePolicy } from './schema/workforce.schema';
import { settleDayClaim } from './travel-auto-claim';
import { readTravelFacts } from './travel-facts';

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

export async function currentWorkforcePolicy(db: DatabaseExecutor): Promise<WorkforcePolicy> {
  const [row] = await db
    .select({ policy: workforcePolicy.policy })
    .from(workforcePolicy)
    .where(eq(workforcePolicy.id, 'default'))
    .limit(1);
  return withPolicyDefaults(row?.policy);
}

/** The day's recorded route points in time order (empty when none was recorded or kept). */
export async function readRoute(db: DatabaseExecutor, dayId: string | null) {
  if (!dayId) return [];
  return db
    .select({
      recordedAt: dutyPoints.recordedAt,
      latitude: dutyPoints.latitude,
      longitude: dutyPoints.longitude,
      accuracyM: dutyPoints.accuracyM,
      mocked: dutyPoints.mocked,
    })
    .from(dutyPoints)
    .where(eq(dutyPoints.attendanceDayId, dayId))
    .orderBy(asc(dutyPoints.recordedAt), asc(dutyPoints.id));
}

/**
 * Saves the day's travel (live review S3, S4): the km paid, the legs, the visit count and the
 * km rate in force that day. The paid km come from the recorded route, held to the straight
 * lines between the stops (`paidKm`), or are those straight lines when no route was recorded.
 * `distance_m` is the paid km, so claims read it as before. Called when a day closes (End
 * duty, the night job, an approved correction) and again if it closes again or late route
 * points arrive; a day saved before keeps its rate. A day closed before snapshots existed is
 * saved later with `source: 'backfill'`, so it can be told apart. Does nothing, returning
 * null, for a day that is not closed, so a running day is never saved. At a close (not a
 * backfill) the day's claim is then made or brought up to date (`settleDayClaim`); a fault
 * there is logged and never stops the day from closing.
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
  const policy = await currentWorkforcePolicy(db);
  const rate = saved?.ratePaisePerKm ?? policy.travel.ratePaisePerKm;
  const { summary, route, paid, pointsCount } = measureDay({
    stops: facts.stops,
    points: await readRoute(db, facts.dayId),
    ratePaisePerKm: rate,
    visits: facts.visits,
    capRatio: policy.travel.routeCapRatio,
    window: facts.window,
  });
  const values = {
    userId,
    workDate,
    distanceM: paid.paidM,
    ratePaisePerKm: summary.ratePaisePerKm,
    legs: summary.legs.map((leg) => ({ ...leg })),
    visits: summary.visits,
    routeM: route.routeM,
    straightM: summary.distanceM,
    paidM: paid.paidM,
    method: paid.method,
    capApplied: paid.capApplied,
    gapCount: route.gapCount,
    gapMinutes: route.gapMinutes,
    mockedCount: route.mockedCount,
    pointsCount,
    computedAt: now,
    source,
  };
  const { userId: _user, workDate: _date, source: _source, ...changing } = values;
  const [row] = await db
    .insert(travelDays)
    .values(values)
    .onConflictDoUpdate({ target: [travelDays.userId, travelDays.workDate], set: changing })
    .returning();
  if (row && source === 'close') await settleSafely(db, row, policy);
  return row ?? null;
}

/**
 * The claim step in its own savepoint: if it fails, the day still closes. The fault is kept
 * in the audit log and the admin desk is told, once a day (`alertJobFailed`); the morning job
 * settles the day again (`settleMissedDays`).
 */
async function settleSafely(
  db: DatabaseExecutor,
  snapshot: TravelDaySnapshot,
  policy: WorkforcePolicy,
): Promise<void> {
  try {
    await db.transaction((inner) => settleDayClaim(inner, snapshot, policy));
  } catch (error) {
    console.error('Travel claim step failed', snapshot.userId, snapshot.workDate, error);
    await reportSettleFailure(db, snapshot, error);
  }
}

async function reportSettleFailure(
  db: DatabaseExecutor,
  snapshot: TravelDaySnapshot,
  error: unknown,
): Promise<void> {
  try {
    await db.transaction(async (inner) => {
      await inner.insert(auditLog).values({
        actorUserId: null,
        action: 'travel_claim.settle_failed',
        entity: 'travel_day',
        entityId: snapshot.id,
        data: { userId: snapshot.userId, workDate: snapshot.workDate, error: jobErrorText(error) },
      });
      await alertJobFailed(inner, 'travel_claim', error, todayIn(businessTimeZone()));
    });
  } catch (reporting) {
    console.error('Travel claim failure could not be reported', reporting);
  }
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
