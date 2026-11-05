import {
  type ContactChannel,
  offWhatsAppPathForTemplate,
  routeFor,
  SMS_WORDS_OF,
  skippedAfterStop,
  smsCanStandIn,
  smsText,
  templateIsOn,
} from '@oneohm/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { brandName } from './company-brand';
import { actionIn, handOver, markChannel } from './customer-channel-tasks';
import { customers } from './schema/crm.schema';
import { customerHandovers } from './schema/customer-handovers.schema';
import { messageTemplates } from './schema/message-templates.schema';
import { outbox } from './schema/records.schema';

/** Plain words for a message with no in-app wording of its own. */
export const GENERIC_WORDS = {
  title: 'News about your solar project',
  body: 'Please open the OneOhm app or call us.',
} as const;

interface Message {
  readonly recipient: string;
  readonly template: string;
  readonly payload: Record<string, string>;
  readonly dedupeKey: string;
  readonly words: { readonly title: string; readonly body: string };
  /** WhatsApp said the number is not on WhatsApp: route it as an SMS customer's message. */
  readonly fallback?: boolean;
}

/**
 * Sends one customer message the way that reaches them (owner's rule): WhatsApp first,
 * SMS when they are not on WhatsApp, and a "share in person" item when neither works.
 * A nice-to-have message to a customer who said STOP is not sent at all (`skippedAfterStop`).
 * Returns whether something new was queued.
 */
export async function routeCustomerMessage(
  db: DatabaseExecutor,
  message: Message,
): Promise<boolean> {
  const [customer] = await db
    .select({
      id: customers.id,
      channel: customers.contactChannel,
      unreachable: customers.whatsappUnreachableAt,
      optIn: customers.whatsappOptIn,
    })
    .from(customers)
    .where(eq(customers.phoneE164, message.recipient))
    .limit(1);
  // After STOP the nice-to-have messages are skipped, not moved to SMS.
  if (customer && skippedAfterStop(message.template, customer.optIn)) return false;
  const chosen = customer
    ? routeFor({
        channel: customer.channel,
        whatsappUnreachable: customer.unreachable !== null,
        whatsappOptIn: customer.optIn,
      })
    : 'whatsapp';
  const route = message.fallback && chosen === 'whatsapp' ? 'sms' : chosen;
  let chatAsk = false;
  if (route !== 'whatsapp') {
    const path = offWhatsAppPathForTemplate(message.template);
    // Marketing is never an SMS; a reminder to open the chat has nothing to remind of (the ask was handed over).
    if (path === 'never' || path === 'skip') return false;
    chatAsk = path === 'in_person';
    // The team's task is staff work, not a message: the template's switch does not stop it. An SMS does stop.
    if (route === 'sms' && !chatAsk) {
      const [config] = await db
        .select({ active: messageTemplates.active })
        .from(messageTemplates)
        .where(eq(messageTemplates.key, message.template))
        .limit(1);
      // A message the owner switched off (or one Meta has not approved yet) is not sent by SMS either.
      if (!templateIsOn(message.template, config)) return false;
    }
    const inPerson = route === 'in_person' || chatAsk;
    const actionId = customer ? await actionIn(db, customer.id, message.payload) : null;
    // The ask remembers how it travels now (a staff-sent one said WhatsApp before the number failed).
    if (actionId) await markChannel(db, actionId, inPerson ? 'in_person' : 'sms');
    // Only the chat can take this answer: the team does it with the customer in person.
    if (customer && inPerson) return handOver(db, customer.id, message, chatAsk, actionId);
  }
  const sms = route === 'sms';
  const inserted = await db
    .insert(outbox)
    .values({
      channel: sms ? 'sms' : 'whatsapp',
      recipient: message.recipient,
      template: message.template,
      payload: sms
        ? {
            ...message.payload,
            text: smsText(message.words.title, message.words.body, await brandName(db)),
          }
        : message.payload,
      dedupeKey: sms ? `${message.dedupeKey}:sms` : message.dedupeKey,
      // The clock, not the transaction's start: messages queued together go out in order.
      createdAt: sql`clock_timestamp()`,
    })
    .onConflictDoNothing()
    .returning({ id: outbox.id });
  return inserted.length > 0;
}

/** How a message reaches this customer now (their setting, what WhatsApp told us, STOP). */
export async function routeOfCustomer(
  db: DatabaseExecutor,
  customerId: string,
): Promise<ContactChannel> {
  const [customer] = await db
    .select({
      channel: customers.contactChannel,
      unreachable: customers.whatsappUnreachableAt,
      optIn: customers.whatsappOptIn,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return customer
    ? routeFor({
        channel: customer.channel,
        whatsappUnreachable: customer.unreachable !== null,
        whatsappOptIn: customer.optIn,
      })
    : 'whatsapp';
}

/** A task for the team on the customer handovers list: do or say this with the customer in person. */
export async function handOverInPerson(
  db: DatabaseExecutor,
  customerId: string,
  message: Pick<Message, 'template' | 'dedupeKey' | 'words'> & {
    readonly projectId?: string | null;
  },
): Promise<boolean> {
  const inserted = await db
    .insert(customerHandovers)
    .values({
      customerId,
      projectId: message.projectId ?? null,
      template: message.template,
      title: message.words.title,
      body: message.words.body,
      dedupeKey: message.dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: customerHandovers.id });
  return inserted.length > 0;
}

/**
 * WhatsApp said the number is not on WhatsApp: remember it, and send the same message by
 * SMS instead, once. Later messages go by SMS straight away.
 */
export async function fallBackToSms(
  db: DatabaseExecutor,
  outboxId: string,
  words: (template: string, payload: Record<string, string>) => { title: string; body: string },
): Promise<boolean> {
  const [row] = await db.select().from(outbox).where(eq(outbox.id, outboxId)).limit(1);
  // A staff message fails visibly instead of going by SMS.
  if (row?.channel !== 'whatsapp' || !smsCanStandIn(row.template)) return false;
  await db
    .update(customers)
    .set({ whatsappUnreachableAt: new Date() })
    .where(and(eq(customers.phoneE164, row.recipient), isNull(customers.whatsappUnreachableAt)));
  const payload = (row.payload ?? {}) as Record<string, string>;
  // The same rules as any message to a customer off WhatsApp: marketing never, chat-only asks a task.
  return routeCustomerMessage(db, {
    recipient: row.recipient,
    template: row.template,
    payload,
    dedupeKey: row.dedupeKey ?? row.id,
    words: words(SMS_WORDS_OF[row.template] ?? row.template, payload),
    fallback: true,
  });
}
