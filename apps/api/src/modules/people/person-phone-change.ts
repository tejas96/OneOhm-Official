import { type DatabaseExecutor, otpChallenges, outbox, sessions, users } from '@oneohm/database';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Environment } from '../../config/environment';
import { queueInvite, roleKindsByUser } from './person-invite';

export const OLD_NUMBER_NOTE = 'The mobile number was changed.';

/**
 * After a person's number changes, nothing waits on the old one: the phone is signed out,
 * unused codes and queued messages to it are dropped, and someone invited but not signed in
 * yet gets the invite again on the new number (no 10-minute wait: that is for resends).
 */
export async function afterPhoneChange(
  tx: DatabaseExecutor,
  env: Pick<Environment, 'STAFF_INVITES' | 'FIELD_APP_URL' | 'WEB_BASE_URL'>,
  userId: string,
  oldPhone: string | null,
  options: { readonly reinvite: boolean },
): Promise<void> {
  await tx.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.client, 'mobile')));
  if (oldPhone) {
    await tx
      .delete(otpChallenges)
      .where(and(eq(otpChallenges.phoneE164, oldPhone), isNull(otpChallenges.consumedAt)));
    await tx
      .update(outbox)
      .set({ status: 'skipped', lastError: OLD_NUMBER_NOTE })
      .where(
        and(
          eq(outbox.recipient, oldPhone),
          inArray(outbox.channel, ['whatsapp', 'sms']),
          eq(outbox.status, 'pending'),
        ),
      );
  }
  if (!options.reinvite) return;
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user?.status !== 'active' || user.lastActiveAt || !user.phoneE164) return;
  const roleKinds = (await roleKindsByUser(tx, [userId])).get(userId) ?? [];
  await queueInvite(tx, env, { ...user, phoneE164: user.phoneE164, roleKinds });
}
