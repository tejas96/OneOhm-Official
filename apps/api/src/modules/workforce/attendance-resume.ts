import {
  attendanceDays,
  businessTimeZone,
  dropTravelSnapshot,
  notifications,
  travelClaims,
} from '@oneohm/database';
import { canResumeDay } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict } from '../../common/http/errors';
import type { Database } from '../../config/core.module';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * A claim already made from the closed day would no longer match it once it reopens, so a
 * pending or approved one blocks the resume (409 `claim_exists`). The exception is the claim
 * the system made that still waits: it is withdrawn, not deleted (status `cancelled`, with
 * `withdrawn_by_resume_at`), so a notice that links to it still opens it, and the close that
 * follows makes the day's claim afresh. The claim row is locked first, and the withdrawal only
 * takes a claim that is still pending and automatic: if a manager or the morning job decided
 * it at the same moment, no row changes and the resume is refused (409 `claim_exists`).
 */
async function withdrawWaitingClaim(tx: Tx, actor: Actor, workDate: string): Promise<void> {
  const [claim] = await tx
    .select({ id: travelClaims.id })
    .from(travelClaims)
    .where(
      and(
        eq(travelClaims.userId, actor.userId),
        eq(travelClaims.workDate, workDate),
        inArray(travelClaims.status, ['pending', 'approved']),
      ),
    )
    .for('update')
    .limit(1);
  if (!claim) return;
  const now = new Date();
  const [withdrawn] = await tx
    .update(travelClaims)
    .set({ status: 'cancelled', withdrawnByResumeAt: now, updatedAt: now })
    .where(
      and(
        eq(travelClaims.id, claim.id),
        eq(travelClaims.status, 'pending'),
        eq(travelClaims.autoMade, true),
      ),
    )
    .returning({ id: travelClaims.id });
  if (!withdrawn)
    throw conflict(
      'A travel claim already exists for this day, so it cannot be resumed.',
      'claim_exists',
    );
  // The alerts about it (to the person and to those who decide) need no action any more.
  await tx
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.subjectType, 'travel_claim'),
        eq(notifications.subjectId, claim.id),
        isNull(notifications.readAt),
      ),
    );
  await recordAudit(tx, actor.userId, 'travel_claim.withdrawn', 'travel_claim', claim.id, {
    reason: 'duty resumed',
  });
}

/**
 * Takes back an End duty made by the person today (live review A10): the check-out is
 * cleared and the day is open again. A day the night job ended, a correction changed or
 * an earlier date closed stays closed, and so does a day with an approved travel claim or one the
 * person made (409 `claim_exists`). A claim the system made that still waits is withdrawn (kept, marked). Written to the audit log in the same transaction.
 */
export async function resumeDuty(db: Database, actor: Actor): Promise<void> {
  const today = todayIn(businessTimeZone());
  await db.transaction(async (tx) => {
    const [day] = await tx
      .select()
      .from(attendanceDays)
      .where(and(eq(attendanceDays.userId, actor.userId), eq(attendanceDays.workDate, today)))
      .for('update')
      .limit(1);
    if (!day || !canResumeDay(day, today))
      throw conflict('This day cannot be resumed. Ask for a correction instead.', 'not_resumable');
    await withdrawWaitingClaim(tx, actor, day.workDate);
    await tx
      .update(attendanceDays)
      .set({
        checkOutAt: null,
        checkOutLatitude: null,
        checkOutLongitude: null,
        checkOutAccuracyM: null,
        checkOutInside: null,
        checkOutReceivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(attendanceDays.id, day.id));
    // The saved travel is for a closed day; the day closes again, and is saved again, later.
    await dropTravelSnapshot(tx, actor.userId, day.workDate);
    await recordAudit(tx, actor.userId, 'attendance.resumed', 'attendance_day', day.id, {
      workDate: day.workDate,
      checkedOutAt: day.checkOutAt?.toISOString() ?? null,
    });
  });
}
