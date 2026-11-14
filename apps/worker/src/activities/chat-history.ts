import {
  customerContacts,
  customerNotice,
  customers,
  type Database,
  localValues,
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
  /** When it was queued: the chat log keeps queue order, as chat replies are logged then. */
  readonly createdAt?: Date;
}

/**
 * Puts a sent business message (payment due, installation started…) into the customer's
 * WhatsApp chat, so whoever answers sees what the customer is replying to. Chat replies
 * and follow-ups are already in the chat when they are queued, so they are left alone.
 */
export async function logTemplateInChat(
  db: Database,
  row: SentTemplate,
  sentText?: string,
): Promise<void> {
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
    kind: sentText ? 'text' : 'template',
    body: sentText ?? templateLogText(row.template, words, values, config),
    outboxId: row.id,
    ...(row.createdAt && { createdAt: row.createdAt }),
  });
}

/**
 * What the staff log says a template said: its English preview, or, when the Marathi or
 * Hindi template went out, the same news in that language (what the customer read), tagged.
 */
export function templateLogText(
  template: string,
  words: { readonly preview: string; readonly fields: readonly string[] },
  values: Record<string, string>,
  config: Parameters<typeof sentInTag>[0] | undefined,
): string {
  const tag = config ? sentInTag(config, values.language) : '';
  if (!tag) return renderTemplate(words.preview, words.fields, values);
  const local = customerNotice(
    template,
    localValues(values.language, template, values),
    'log',
    values.language,
  );
  if (!local)
    return `${renderTemplate(words.preview, words.fields, localValues(values.language, template, values))}${tag}`;
  return `${local.body ? `${local.title}: ${local.body}` : local.title}${tag}`;
}
