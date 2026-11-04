import {
  attendanceDays,
  commissionRules,
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
import { and, eq, isNull, sql } from 'drizzle-orm';

/**
 * Shuts down what a person who left still has running (spec "Work in progress at the
 * moment of removal"): sign-ins, phones, location tracking, an open site visit, today's
 * attendance, their pending leave, unused sign-in codes, WhatsApp messages queued to them
 * and their own commission rule. Money owed to them is not touched.
 */
export async function wrapUp(tx: Transaction, userId: string, now: Date): Promise<void> {
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
    .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'pending')));
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
  await tx
    .update(commissionRules)
    .set({ active: false, version: sql`${commissionRules.version} + 1`, updatedAt: now })
    .where(and(eq(commissionRules.resellerUserId, userId), eq(commissionRules.active, true)));
}
