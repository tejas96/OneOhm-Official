import {
  customerContacts,
  customers,
  type Database,
  messageTemplates,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { DEFAULT_MESSAGE_TEMPLATES, renderTemplate, soleCustomer } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { sentInTag } from '../channels/message-templates';

interface SentTemplate {
  readonly id: string;
  readonly recipient: string;
  readonly template: string;
  readonly payload: unknown;
  readonly dedupeKey: string | null;
}

/**
 * Puts a sent business message (payment due, installation started…) into the customer's
 * WhatsApp chat, so whoever answers sees what the customer is replying to. Chat replies
 * and follow-ups are already in the chat when they are queued, so they are left alone.
 */
export async function logTemplateInChat(db: Database, row: SentTemplate): Promise<void> {
  if (row.template.startsWith('session:') || row.dedupeKey?.startsWith('chat:')) return;
  // The customer's own number, or a family member on exactly one customer's list.
  const [own] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.phoneE164, row.recipient))
    .limit(1);
  const customer =
    own ??
    soleCustomer(
      await db
        .select({ id: customers.id, name: customers.name })
        .from(customerContacts)
        .innerJoin(customers, eq(customers.id, customerContacts.customerId))
        .where(
          and(eq(customerContacts.phoneE164, row.recipient), isNull(customerContacts.revokedAt)),
        )
        .limit(2),
    );
  // Staff digests and other people's numbers have no customer chat to join.
  if (!customer) return;
  const [config] = await db
    .select({
      fields: messageTemplates.fields,
      preview: messageTemplates.preview,
      metaName: messageTemplates.metaName,
      language: messageTemplates.language,
      metaNameMr: messageTemplates.metaNameMr,
      metaNameHi: messageTemplates.metaNameHi,
    })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, row.template))
    .limit(1);
  const fallback = DEFAULT_MESSAGE_TEMPLATES.find((item) => item.key === row.template);
  const words = config ?? fallback;
  if (!words) return;
  const values = Object.fromEntries(
    Object.entries((row.payload ?? {}) as Record<string, unknown>).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
  const [chat] = await db
    .insert(waConversations)
    .values({ phone: row.recipient, customerId: customer.id, profileName: customer.name })
    .onConflictDoUpdate({ target: waConversations.phone, set: { updatedAt: new Date() } })
    .returning({ id: waConversations.id });
  if (!chat) return;
  await db.insert(waMessages).values({
    conversationId: chat.id,
    direction: 'out',
    kind: 'template',
    // Staff read English; a Marathi or Hindi template says so at the end.
    body: `${renderTemplate(words.preview, words.fields, values)}${config ? sentInTag(config, values.language) : ''}`,
    outboxId: row.id,
  });
}
