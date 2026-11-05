import { SMS_WORDS_OF } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { GENERIC_WORDS, type Routed, routeMessage, wasQueued } from './customer-channel';
import { NOTICE_WORDS } from './customer-message-en';
import { plainNames } from './customer-message-names';
import { languageOf, localWords } from './customer-message-words';
import { appWords, offWhatsApp } from './customer-notice-app';
import { type Notice, notify } from './notify';
import { customers } from './schema/crm.schema';

type Payload = Readonly<Record<string, string>>;

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
  // A paper asked again carries the reason; the app says it in the same words either way.
  const asked =
    payload.reason && (template === 'document_requested' || template === 'paper_request');
  const said = asked ? 'paper_again' : template;
  const words = localWords(language, said) ?? NOTICE_WORDS[said];
  if (!words) return null;
  return { kind: template, ...words(payload), dedupeKey: `notice:${dedupeKey}` };
}

/**
 * Queues a customer WhatsApp message in the caller's transaction (the worker sends it
 * with retries) and puts the same news in the customer's app inbox. The dedupe key stops
 * the same event messaging twice. Project and instalment are said in plain words (see
 * plainNames). Returns whether the message was new.
 */
export async function queueCustomerMessage(
  db: DatabaseExecutor,
  recipientE164: string,
  template: string,
  given: Record<string, string>,
  dedupeKey: string,
): Promise<boolean> {
  return wasQueued(await queueCustomerMessageAs(db, recipientE164, template, given, dedupeKey));
}

/** `queueCustomerMessage`, saying what was done (a message, a task, already queued, or nothing). */
export async function queueCustomerMessageAs(
  db: DatabaseExecutor,
  recipientE164: string,
  template: string,
  given: Record<string, string>,
  dedupeKey: string,
): Promise<Routed> {
  const payload = await plainNames(db, given);
  // WhatsApp first; SMS or in person when the customer is not on WhatsApp (SMS words: see SMS_WORDS_OF).
  const queued = await routeMessage(db, {
    recipient: recipientE164,
    template,
    // The customer's language rides along for the worker (WhatsApp stays in its approved one).
    payload: { ...payload, language: await languageOf(db, recipientE164) },
    dedupeKey,
    words: customerNotice(SMS_WORDS_OF[template] ?? template, payload, dedupeKey) ?? GENERIC_WORDS,
  });
  await noticeCustomer(db, recipientE164, template, payload, dedupeKey);
  return queued;
}

/**
 * Only the app-inbox half of a customer message, in each owner's language: for when the
 * news already reaches WhatsApp another way (the quote's PDF and buttons in an open chat).
 */
export async function noticeCustomer(
  db: DatabaseExecutor,
  recipientE164: string,
  template: string,
  payload: Payload,
  dedupeKey: string,
): Promise<void> {
  const notice = customerNotice(template, payload, dedupeKey);
  if (!notice) return;
  const owners = await db
    .select({
      id: customers.id,
      language: customers.preferredLanguage,
      contactChannel: customers.contactChannel,
      whatsappUnreachableAt: customers.whatsappUnreachableAt,
      whatsappOptIn: customers.whatsappOptIn,
    })
    .from(customers)
    .where(eq(customers.phoneE164, recipientE164));
  for (const owner of owners) {
    const own = customerNotice(template, payload, dedupeKey, owner.language) ?? notice;
    // Off WhatsApp the inbox must not point to a chat they do not have.
    const said = offWhatsApp(owner) ? appWords(template, own, owner.language) : own;
    await notify(
      db,
      { customerId: owner.id },
      { ...said, dedupeKey: `${notice.dedupeKey}:${owner.id}` },
    );
  }
}
