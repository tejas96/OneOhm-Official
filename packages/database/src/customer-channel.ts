import { routeFor, skippedAfterStop, smsText } from '@oneohm/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { brandName } from './company-brand';
import { customers } from './schema/crm.schema';
import { customerHandovers } from './schema/customer-handovers.schema';
import { projects } from './schema/projects.schema';
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
  const route = customer
    ? routeFor({
        channel: customer.channel,
        whatsappUnreachable: customer.unreachable !== null,
        whatsappOptIn: customer.optIn,
      })
    : 'whatsapp';
  if (route === 'in_person' && customer) return handOver(db, customer.id, message);
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

async function handOver(
  db: DatabaseExecutor,
  customerId: string,
  message: Message,
): Promise<boolean> {
  // `project` holds the town and size by now (plainNames); the code rides as `projectCode`.
  const code = message.payload.projectCode ?? message.payload.project;
  const [project] = code
    ? await db.select({ id: projects.id }).from(projects).where(eq(projects.code, code)).limit(1)
    : [];
  const inserted = await db
    .insert(customerHandovers)
    .values({
      customerId,
      projectId: project?.id ?? null,
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
  if (row?.channel !== 'whatsapp') return false;
  await db
    .update(customers)
    .set({ whatsappUnreachableAt: new Date() })
    .where(and(eq(customers.phoneE164, row.recipient), isNull(customers.whatsappUnreachableAt)));
  const payload = (row.payload ?? {}) as Record<string, string>;
  const said = words(row.template, payload);
  const inserted = await db
    .insert(outbox)
    .values({
      channel: 'sms',
      recipient: row.recipient,
      template: row.template,
      payload: { ...payload, text: smsText(said.title, said.body, await brandName(db)) },
      dedupeKey: `${row.dedupeKey ?? row.id}:sms`,
      createdAt: sql`clock_timestamp()`,
    })
    .onConflictDoNothing()
    .returning({ id: outbox.id });
  return inserted.length > 0;
}
