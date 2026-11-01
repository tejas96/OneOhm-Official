import { type DatabaseExecutor, queueCustomerMessage } from '@oneohm/database';

/**
 * Queues a customer message in the same transaction as the change that causes it; the
 * worker sends it with retries, and the customer's app inbox gets the same news.
 */
export async function queueWhatsApp(
  db: DatabaseExecutor,
  recipientE164: string,
  template: string,
  payload: Record<string, string>,
  dedupeKey: string,
): Promise<void> {
  await queueCustomerMessage(db, recipientE164, template, payload, dedupeKey);
}
