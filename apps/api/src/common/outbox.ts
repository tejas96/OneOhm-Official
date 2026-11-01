import { type DatabaseExecutor, outbox } from '@oneohm/database';

/**
 * Queues a customer message in the same transaction as the change that causes it; the
 * worker sends it with retries. The dedupe key stops the same event messaging twice.
 */
export async function queueWhatsApp(
  db: DatabaseExecutor,
  recipientE164: string,
  template: string,
  payload: Record<string, string>,
  dedupeKey: string,
): Promise<void> {
  await db
    .insert(outbox)
    .values({ channel: 'whatsapp', recipient: recipientE164, template, payload, dedupeKey })
    .onConflictDoNothing();
}
