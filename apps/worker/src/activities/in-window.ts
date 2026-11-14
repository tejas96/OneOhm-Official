import {
  chatSentence,
  customers,
  type Database,
  messageTemplates,
  type outbox,
  waConversations,
} from '@oneohm/database';
import {
  chatWindowOpen,
  DEFAULT_MESSAGE_TEMPLATES,
  templateExtras,
  templateIsOn,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { templateFor } from '../channels/message-templates';
import type { SessionMessage } from '../channels/whatsapp-cloud';

export const OPTED_OUT_NOTE = 'The person asked not to get WhatsApp messages';

/** Why this number gets no template: the customer opted out, or the person sent STOP. */
export async function optOutNote(db: Database, phone: string): Promise<string | null> {
  const [chat] = await db
    .select({ optedOutAt: waConversations.optedOutAt })
    .from(waConversations)
    .where(eq(waConversations.phone, phone))
    .limit(1);
  if (chat?.optedOutAt) return OPTED_OUT_NOTE;
  const [customer] = await db
    .select({ optIn: customers.whatsappOptIn })
    .from(customers)
    .where(eq(customers.phoneE164, phone))
    .limit(1);
  if (customer && !customer.optIn) return 'The customer has opted out of WhatsApp messages.';
  return null;
}

/** Meta refuses a chat message once the window closes, so retries check it again. */
export async function windowOpenFor(db: Database, phone: string): Promise<boolean> {
  const [chat] = await db
    .select({ lastInboundAt: waConversations.lastInboundAt })
    .from(waConversations)
    .where(eq(waConversations.phone, phone))
    .limit(1);
  return chatWindowOpen(chat?.lastInboundAt);
}

/**
 * A customer message that would go out in English to a Marathi or Hindi customer (no
 * template approved in their language) while their chat window is open: the same news as
 * a plain chat message in their language instead. Null when the template should go as is:
 * the customer's language has a template, the message carries a file or buttons, the
 * customer opted out or sent STOP, the message is switched off, or the window is closed.
 */
export async function chatInsteadOfTemplate(
  db: Database,
  row: typeof outbox.$inferSelect,
): Promise<{ readonly message: SessionMessage; readonly text: string } | null> {
  if (row.channel !== 'whatsapp' || row.template.startsWith('session:')) return null;
  // A template a person chose in the chat is sent as chosen.
  if (row.dedupeKey.startsWith('chat:')) return null;
  const payload = (row.payload ?? {}) as Record<string, string>;
  const language = payload.language;
  if (language !== 'mr-IN' && language !== 'hi-IN') return null;
  const fallback = DEFAULT_MESSAGE_TEMPLATES.find((item) => item.key === row.template);
  if (fallback?.audience !== 'customer' || templateExtras(row.template)) return null;
  const [config] = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.key, row.template))
    .limit(1);
  if (!templateIsOn(row.template, config)) return null;
  const names = { metaName: row.template, language: 'en', ...config };
  if (templateFor(names, language).local) return null;
  if (await optOutNote(db, row.recipient)) return null;
  if (!(await windowOpenFor(db, row.recipient))) return null;
  const text = chatSentence(row.template, payload, language);
  return text ? { message: { kind: 'text', body: text }, text } : null;
}
