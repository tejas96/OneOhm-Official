import { travelAmountPaise, type WorkforcePolicy } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, eq, gt, gte, lt, lte, notExists, sql } from 'drizzle-orm';
import type { Database, Transaction } from './client';
import { travelClaims, travelDays } from './schema/site-activity.schema';
import { settleDayClaim, tellNeedsPerson } from './travel-auto-claim';
import { approveTravelClaim } from './travel-claim-approve';
import { notWithdrawn, reviewDayClaim, sameReasons } from './travel-claim-review';

export const SYSTEM_APPROVAL_NOTE = 'Approved automatically: clean day';

/**
 * The morning job: approves, as the system, each automatic claim of an earlier day that is
 * still waiting, has not been withdrawn and is still clean when read again against the latest
 * saved day (route points may have arrived since, a leave may have been approved). One that
 * is no longer clean stays pending with its reasons brought up to date, and the people who
 * decide it are told. Each claim is its own transaction with the claim row locked, so a
 * manager's decision or the person's resume at the same moment wins or loses cleanly. Safe to
 * run again: a claim already decided is skipped. Returns how many were approved.
 */
export async function approveCleanAutoClaims(
  db: Database,
  today: string,
  policy: WorkforcePolicy,
): Promise<{ approved: number; failed: number; firstError: unknown }> {
  if (!policy.travel.autoApprove) return { approved: 0, failed: 0, firstError: null };
  const due = await db
    .select({ id: travelClaims.id })
    .from(travelClaims)
    .where(
      and(
        eq(travelClaims.status, 'pending'),
        eq(travelClaims.autoMade, true),
        notWithdrawn,
        lt(travelClaims.workDate, today),
      ),
    );
  let approved = 0;
  let failed = 0;
  let firstError: unknown = null;
  for (const { id } of due) {
    try {
      if (await db.transaction((tx) => approveOne(tx, id, policy))) approved += 1;
    } catch (error) {
      failed += 1;
      firstError ??= error;
      console.error('Automatic travel approval failed', id, error);
    }
  }
  return { approved, failed, firstError };
}

async function approveOne(tx: Transaction, id: string, policy: WorkforcePolicy): Promise<boolean> {
  const [claim] = await tx
    .select()
    .from(travelClaims)
    .where(eq(travelClaims.id, id))
    .for('update')
    .limit(1);
  if (claim?.status !== 'pending' || !claim.autoMade || claim.withdrawnByResumeAt) return false;
  const [snap] = await tx
    .select()
    .from(travelDays)
    .where(and(eq(travelDays.userId, claim.userId), eq(travelDays.workDate, claim.workDate)))
    .limit(1);
  if (!snap) return false;
  // The claim must be the day as it is saved now; a refresh at the next close brings it level.
  const amountPaise = travelAmountPaise(snap.paidM, snap.ratePaisePerKm);
  if (claim.distanceM !== snap.paidM || claim.amountPaise !== amountPaise) return false;
  const { review } = await reviewDayClaim(tx, snap, policy, false);
  if (!sameReasons(claim.reviewReasons, review.reasons))
    await tx
      .update(travelClaims)
      .set({
        reviewReasons: review.reasons.length > 0 ? [...review.reasons] : null,
        updatedAt: new Date(),
      })
      .where(eq(travelClaims.id, id));
  if (!review.approve) {
    await tellNeedsPerson(tx, claim);
    return false;
  }
  await approveTravelClaim(tx, claim, { userId: null, note: SYSTEM_APPROVAL_NOTE });
  return true;
}

/**
 * Closed days of the last 7 days that were saved but got no claim, say because the claim step
 * failed at the close, are settled again when automatic claims are on. A day that already has
 * any claim (a cancelled or declined one included) is left alone, so this is safe to repeat.
 * Returns how many claims were made, and how many days failed again.
 */
export async function settleMissedDays(
  db: Database,
  today: string,
  policy: WorkforcePolicy,
): Promise<{ made: number; failed: number; firstError: unknown }> {
  if (!policy.travel.autoClaim) return { made: 0, failed: 0, firstError: null };
  const days = await db
    .select()
    .from(travelDays)
    .where(
      and(
        gte(travelDays.workDate, addDays(today, -MISSED_DAYS_LOOKBACK)),
        lte(travelDays.workDate, today),
        gt(travelDays.paidM, 0),
        notExists(
          db
            .select({ one: sql`1` })
            .from(travelClaims)
            .where(
              and(
                eq(travelClaims.userId, travelDays.userId),
                eq(travelClaims.workDate, travelDays.workDate),
                notWithdrawn,
              ),
            ),
        ),
      ),
    );
  let made = 0;
  let failed = 0;
  let firstError: unknown = null;
  for (const day of days) {
    try {
      if (await db.transaction((tx) => settleDayClaim(tx, day, policy))) made += 1;
    } catch (error) {
      failed += 1;
      firstError ??= error;
      console.error('Travel claim retry failed', day.userId, day.workDate, error);
    }
  }
  return { made, failed, firstError };
}

/** Days back from today whose missed claims are tried again. */
export const MISSED_DAYS_LOOKBACK = 7;
