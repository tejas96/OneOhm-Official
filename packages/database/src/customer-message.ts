import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { type Notice, notify } from './notify';
import { customers } from './schema/crm.schema';
import { outbox } from './schema/records.schema';

type Payload = Readonly<Record<string, string>>;
type Words = (payload: Payload) => { readonly title: string; readonly body: string };

/**
 * What a customer sees in the app for each WhatsApp message (PRD 5.1, 6.2). Only the
 * customer-facing messages are here; staff digests have no entry and stay WhatsApp only.
 */
const WORDS: Readonly<Record<string, Words>> = {
  quotation_sent: (p) => ({
    title: 'Your quotation is ready',
    body: `${p.number}: ${p.total}. After subsidy you pay ${p.effective}.`,
  }),
  project_started: (p) => ({
    title: 'Your solar project has started',
    body: `${p.project}: a ${p.capacity} system.`,
  }),
  project_milestone: (p) => ({ title: p.milestone ?? 'Project update', body: p.project ?? '' }),
  payment_received: (p) => ({
    title: 'Payment received',
    body: `${p.amount} for ${p.milestone}. Thank you.`,
  }),
  payment_link: (p) => ({
    title: 'Pay online',
    body: `${p.amount} for ${p.milestone} on ${p.project}. Open Payments to pay by UPI or card.`,
  }),
  payment_reminder: (p) => ({
    title: 'Payment due',
    body: `${p.amount} for ${p.milestone} on ${p.project}.`,
  }),
  service_update: (p) => ({ title: 'Service request update', body: `${p.topic}: ${p.status}.` }),
  change_request_raised: (p) => ({
    title: 'Change request started',
    body: `${p.request}, number ${p.number}.`,
  }),
  change_request_completed: (p) => ({
    title: 'Change request done',
    body: `${p.request}, number ${p.number}.`,
  }),
};

/** The in-app alert for a customer message, or null when the message has none. */
export function customerNotice(
  template: string,
  payload: Payload,
  dedupeKey: string,
): Notice | null {
  const words = WORDS[template];
  if (!words) return null;
  return { kind: template, ...words(payload), dedupeKey: `notice:${dedupeKey}` };
}

/**
 * Queues a customer WhatsApp message in the caller's transaction (the worker sends it
 * with retries) and puts the same news in the customer's app inbox. The dedupe key stops
 * the same event messaging twice. Returns whether the message was new.
 */
export async function queueCustomerMessage(
  db: DatabaseExecutor,
  recipientE164: string,
  template: string,
  payload: Record<string, string>,
  dedupeKey: string,
): Promise<boolean> {
  const inserted = await db
    .insert(outbox)
    .values({ channel: 'whatsapp', recipient: recipientE164, template, payload, dedupeKey })
    .onConflictDoNothing()
    .returning({ id: outbox.id });
  const notice = customerNotice(template, payload, dedupeKey);
  if (!notice) return inserted.length > 0;
  const owners = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phoneE164, recipientE164));
  for (const owner of owners) {
    await notify(
      db,
      { customerId: owner.id },
      { ...notice, dedupeKey: `${notice.dedupeKey}:${owner.id}` },
    );
  }
  return inserted.length > 0;
}
