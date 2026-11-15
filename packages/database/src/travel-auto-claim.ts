import { travelAmountPaise, type WorkforcePolicy } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor, Transaction } from './client';
import { notify } from './notify';
import { users } from './schema/identity.schema';
import { auditLog } from './schema/records.schema';
import { travelClaims, type travelDays } from './schema/site-activity.schema';
import { tellClaimDeciders } from './travel-approvers';
import { reviewDayClaim, sameReasons } from './travel-claim-review';
import { TRAVEL_NOTICES } from './travel-notices';

type Snapshot = typeof travelDays.$inferSelect;

/**
 * Keeps the day's claim in step with the saved travel (Duty Day step 2). Called after the
 * day's travel is saved at a close, and again when late points or a correction change it.
 *
 * - A pending claim takes the new distance, legs, amount and review reasons, and a change of
 *   km is audited. An approved or paid claim is never touched.
 * - With no claim for the day, the system makes one for the worker when the policy says so
 *   and the day has km and a rate. It is only ever made pending: approving a clean one is left
 *   to the next morning (`approveCleanAutoClaims`). Where a claim existed and the worker or a
 *   manager cancelled or declined it, a person already decided, so none is made again. A claim
 *   the system took back when the person resumed the day does not count: the close that
 *   follows makes the day's claim afresh.
 * - Returns whether a new claim was made.
 */
export async function settleDayClaim(
  tx: Transaction,
  snap: Snapshot,
  policy: WorkforcePolicy,
): Promise<boolean> {
  const claims = (
    await tx
      .select()
      .from(travelClaims)
      .where(and(eq(travelClaims.userId, snap.userId), eq(travelClaims.workDate, snap.workDate)))
  ).filter((claim) => !claim.withdrawnByResumeAt);
  const live = claims.find((claim) => claim.status === 'pending' || claim.status === 'approved');
  const amountPaise = travelAmountPaise(snap.paidM, snap.ratePaisePerKm);
  if (live) {
    if (live.status !== 'pending') return false;
    const { review } = await reviewDayClaim(tx, snap, policy, !live.autoMade);
    const sameKm = live.distanceM === snap.paidM && live.amountPaise === amountPaise;
    if (sameKm && sameReasons(live.reviewReasons, review.reasons)) return false;
    const [updated] = await tx
      .update(travelClaims)
      .set({
        distanceM: snap.paidM,
        ratePaisePerKm: snap.ratePaisePerKm,
        amountPaise,
        legs: snap.legs.map((leg) => ({ ...leg })),
        visits: snap.visits,
        reviewReasons: review.reasons.length > 0 ? [...review.reasons] : null,
        updatedAt: new Date(),
      })
      .where(and(eq(travelClaims.id, live.id), eq(travelClaims.status, 'pending')))
      .returning({ id: travelClaims.id });
    if (updated && !sameKm)
      await tx.insert(auditLog).values({
        actorUserId: null,
        action: 'travel_claim.refreshed',
        entity: 'travel_claim',
        entityId: live.id,
        data: {
          reason: 'route points arrived after the day closed',
          fromDistanceM: live.distanceM,
          toDistanceM: snap.paidM,
          fromAmountPaise: live.amountPaise,
          toAmountPaise: amountPaise,
        },
      });
    return false;
  }
  if (claims.length > 0 || !policy.travel.autoClaim || snap.paidM <= 0 || amountPaise <= 0)
    return false;
  const { review, projectId } = await reviewDayClaim(tx, snap, policy);
  const [row] = await tx
    .insert(travelClaims)
    .values({
      userId: snap.userId,
      workDate: snap.workDate,
      distanceM: snap.paidM,
      ratePaisePerKm: snap.ratePaisePerKm,
      amountPaise,
      legs: snap.legs.map((leg) => ({ ...leg })),
      visits: snap.visits,
      projectId,
      note: null,
      autoMade: true,
      reviewReasons: review.reasons.length > 0 ? [...review.reasons] : null,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return false;
  await tx.insert(auditLog).values({
    actorUserId: null,
    action: 'travel_claim.auto_made',
    entity: 'travel_claim',
    entityId: row.id,
    data: { workDate: row.workDate, amountPaise, distanceM: snap.paidM, reasons: review.reasons },
  });
  if (review.approve) {
    // Clean for now: it is approved by the morning job, if it is still clean then.
    await notify(
      tx,
      { userId: snap.userId },
      TRAVEL_NOTICES.autoReady(row.id, row.workDate, amountPaise),
    );
    return true;
  }
  await tellNeedsPerson(tx, {
    id: row.id,
    userId: snap.userId,
    workDate: row.workDate,
    amountPaise,
  });
  return true;
}

/** The worker hears the claim was sent for approval, and the deciders that it waits (once each). */
export async function tellNeedsPerson(
  tx: DatabaseExecutor,
  claim: { id: string; userId: string; workDate: string; amountPaise: number },
): Promise<void> {
  const [person] = await tx
    .select({ name: users.fullName })
    .from(users)
    .where(eq(users.id, claim.userId))
    .limit(1);
  await notify(
    tx,
    { userId: claim.userId },
    TRAVEL_NOTICES.autoSent(claim.id, claim.workDate, claim.amountPaise),
  );
  await tellClaimDeciders(
    tx,
    claim.userId,
    TRAVEL_NOTICES.made(claim.id, person?.name ?? 'Employee', claim.workDate, claim.amountPaise),
  );
}
