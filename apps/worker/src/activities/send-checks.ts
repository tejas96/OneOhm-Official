import { type DatabaseExecutor, type Notice, notifyStaffHolders } from '@oneohm/database';

export { smsCanStandIn } from '@oneohm/domain';

export const CHAT_WINDOW_CLOSED =
  'Not sent: the chat window closed (the customer last wrote over 23 hours ago).';

/** One alert a day while the WhatsApp token is refused. */
export function tokenExpiredNotice(now: Date): Notice {
  return {
    kind: 'whatsapp_token_expired',
    title: 'WhatsApp token expired — messages are not going out',
    body: 'WhatsApp refused the access token, so no customer messages are being sent. Put a new token in the server settings, then resend the failed messages.',
    dedupeKey: `whatsapp_token_expired:${now.toISOString().slice(0, 10)}`,
  };
}

/** Tells the people who manage Settings, once a day. */
export async function alertTokenExpired(db: DatabaseExecutor, now = new Date()): Promise<void> {
  await notifyStaffHolders(db, 'settings.manage', tokenExpiredNotice(now));
}
