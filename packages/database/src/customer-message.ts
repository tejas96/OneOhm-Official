import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { GENERIC_WORDS, routeCustomerMessage } from './customer-channel';
import { languageOf, localWords } from './customer-message-words';
import { type Notice, notify } from './notify';
import { customers } from './schema/crm.schema';

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
  document_requested: (p) => ({
    title: `Please send your ${p.document}`,
    body: `${p.project}: open Documents and tap Send to add a photo or PDF.`,
  }),
  maintenance_visit: (p) => ({
    title: `Your free ${p.visit} visit is on ${p.date}`,
    body: `${p.project}: our service team will call before they come.`,
  }),
  survey_scheduled: (p) => ({
    title: `Site survey on ${p.date}`,
    body: `${p.project}: our team will call before they come.`,
  }),
  stage_rating_request: (p) => ({
    title: 'How did we do?',
    body: `${p.project}: the ${p.stage} is done. Please rate it in the app.`,
  }),
  installation_started: (p) => ({
    title: 'Installation has started',
    body: `${p.project}: our crew is fitting your ${p.capacity} system.`,
  }),
  commissioning_completed: (p) => ({
    title: 'Your system is switched on',
    body: `${p.project}: the final payment is now due. Open Payments to see it.`,
  }),
  project_update_link: (p) => ({
    title: p.milestone ?? 'Project update',
    body: `${p.project}: the paper is in Documents.`,
  }),
  service_visit_booked: (p) => ({
    title: `Technician visit on ${p.date}`,
    body: `${p.topic}: our technician will call before they come.`,
  }),
  project_waiting: (p) => ({
    title: `Waiting for ${p.reason}`,
    body: `${p.project}: ${p.milestone}. We will keep you posted.`,
  }),
  referral_reward: (p) => ({
    title: 'Referral reward update',
    body: `${p.friend}: ${p.amount} is ${p.status}.`,
  }),
};

/**
 * The in-app alert for a customer message, or null when the message has none. With the
 * customer's language (mr-IN, hi-IN) the words are Marathi or Hindi; English otherwise.
 */
export function customerNotice(
  template: string,
  payload: Payload,
  dedupeKey: string,
  language?: string,
): Notice | null {
  const words = localWords(language, template) ?? WORDS[template];
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
  const notice = customerNotice(template, payload, dedupeKey);
  // WhatsApp first; SMS or in person when the customer is not on WhatsApp.
  const queued = await routeCustomerMessage(db, {
    recipient: recipientE164,
    template,
    // The customer's language rides along for the worker (WhatsApp stays in its approved one).
    payload: { ...payload, language: await languageOf(db, recipientE164) },
    dedupeKey,
    words: notice ?? GENERIC_WORDS,
  });
  if (!notice) return queued;
  const owners = await db
    .select({ id: customers.id, language: customers.preferredLanguage })
    .from(customers)
    .where(eq(customers.phoneE164, recipientE164));
  for (const owner of owners) {
    const said = customerNotice(template, payload, dedupeKey, owner.language) ?? notice;
    await notify(
      db,
      { customerId: owner.id },
      { ...said, dedupeKey: `${notice.dedupeKey}:${owner.id}` },
    );
  }
  return queued;
}
