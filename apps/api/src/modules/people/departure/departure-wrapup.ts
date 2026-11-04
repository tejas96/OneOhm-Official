import {
  attendanceDays,
  leaveRequests,
  locationConsents,
  otpChallenges,
  outbox,
  pushDevices,
  sessions,
  siteVisits,
  type Transaction,
  users,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

/**
 * Shuts down what a person who left still has running (spec "Work in progress at the
 * moment of removal"): sign-ins, phones, location tracking, an open site visit, today's
 * attendance, their pending leave and approved leave after the last working day, unused
 * sign-in codes and WhatsApp messages queued to them. Money owed to them is not touched, and a reseller's commission rule stays on so a
 * lead they brought in still earns (spec "A lead that a removed reseller brought in").
 */
export async function wrapUp(
  tx: Transaction,
  userId: string,
  now: Date,
  lastWorkingDay: string,
): Promise<void> {
  const [person] = await tx
    .select({ phone: users.phoneE164 })
    .from(users)
    .where(eq(users.id, userId));
  await tx.delete(sessions).where(eq(sessions.userId, userId));
  await tx
    .update(pushDevices)
    .set({ disabledAt: now, disabledReason: 'left_team' })
    .where(and(eq(pushDevices.userId, userId), isNull(pushDevices.disabledAt)));
  await tx
    .update(locationConsents)
    .set({ withdrawnAt: now })
    .where(and(eq(locationConsents.userId, userId), isNull(locationConsents.withdrawnAt)));
  await tx
    .update(siteVisits)
    .set({ checkOutAt: now, updatedAt: now })
    .where(and(eq(siteVisits.userId, userId), isNull(siteVisits.checkOutAt)));
  await tx
    .update(attendanceDays)
    .set({ checkOutAt: now, updatedAt: now })
    .where(
      and(
        eq(attendanceDays.userId, userId),
        eq(attendanceDays.workDate, todayIn('Asia/Kolkata', now)),
        isNull(attendanceDays.checkOutAt),
      ),
    );
  await tx
    .update(leaveRequests)
    .set({ status: 'cancelled', updatedAt: now })
    .where(
      and(
        eq(leaveRequests.userId, userId),
        or(
          eq(leaveRequests.status, 'pending'),
          and(eq(leaveRequests.status, 'approved'), gt(leaveRequests.fromDate, lastWorkingDay)),
        ),
      ),
    );
  if (person?.phone) {
    await tx
      .delete(otpChallenges)
      .where(and(eq(otpChallenges.phoneE164, person.phone), isNull(otpChallenges.consumedAt)));
    await tx
      .update(outbox)
      .set({ status: 'skipped', lastError: 'Person left the team.' })
      .where(
        and(
          eq(outbox.recipient, person.phone),
          eq(outbox.channel, 'whatsapp'),
          eq(outbox.status, 'pending'),
        ),
      );
  }
}
