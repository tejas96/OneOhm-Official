import {
  attendanceDays,
  businessTimeZone,
  dropTravelSnapshot,
  travelClaims,
} from '@oneohm/database';
import { canResumeDay } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict } from '../../common/http/errors';
import type { Database } from '../../config/core.module';

/**
 * Takes back an End duty made by the person today (live review A10): the check-out is
 * cleared and the day is open again. A day the night job ended, a correction changed or
 * an earlier date closed stays closed, and so does a day with a pending or approved travel
 * claim (409 `claim_exists`). Written to the audit log in the same transaction.
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
    // A claim already made from the closed day would no longer match it once it reopens.
    const [claim] = await tx
      .select({ id: travelClaims.id })
      .from(travelClaims)
      .where(
        and(
          eq(travelClaims.userId, actor.userId),
          eq(travelClaims.workDate, day.workDate),
          inArray(travelClaims.status, ['pending', 'approved']),
        ),
      )
      .limit(1);
    if (claim)
      throw conflict(
        'A travel claim already exists for this day, so it cannot be resumed.',
        'claim_exists',
      );
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
