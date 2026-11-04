import { customers, type DatabaseExecutor, waConversations } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../../common/audit';
import type { Conversation } from '../chat-store';
import { markContext } from './chat-step';
import { scriptLanguage } from './known-words';
import { type AssistantLanguage, assistantLanguage } from './language';

/**
 * The language to speak in this chat: the one picked in this chat (a family member's own
 * choice stays on their number), else the customer's saved one; a stranger's is the one
 * picked while onboarding.
 */
export async function chatLanguage(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'customerId' | 'language'>,
): Promise<AssistantLanguage> {
  if (!chat.customerId || chat.language) return assistantLanguage(chat.language);
  const [customer] = await db
    .select({ language: customers.preferredLanguage })
    .from(customers)
    .where(eq(customers.id, chat.customerId));
  return assistantLanguage(customer?.language);
}

/**
 * The language the customer picked in the chat (or wrote in): kept on the chat, so every
 * message after is in it, and, from the customer's own number only, on the customer as the
 * app's setting is (with an audit line). A family member never changes the holder's.
 */
export async function saveLanguage(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'id' | 'customerId' | 'phone'>,
  language: AssistantLanguage,
): Promise<void> {
  await db
    .update(waConversations)
    .set({ language, updatedAt: new Date() })
    .where(eq(waConversations.id, chat.id));
  if (!chat.customerId) return;
  const [own] = await db
    .select({ language: customers.preferredLanguage })
    .from(customers)
    .where(and(eq(customers.id, chat.customerId), eq(customers.phoneE164, chat.phone)));
  const to = `${language}-IN`;
  if (!own || own.language === to) return;
  await db
    .update(customers)
    .set({ preferredLanguage: to, updatedAt: new Date() })
    .where(eq(customers.id, chat.customerId));
  await recordAudit(db, null, 'customer.language_changed', 'customer', chat.customerId, {
    from: own.language,
    to,
    via: 'whatsapp',
  });
}

/**
 * The language to answer this message in (principles §2): the saved one, or, when that is
 * English and a known customer types in Devanagari, Marathi or Hindi by its words (saved
 * at once). `ask` when the words do not tell which, the first time only: the message is
 * answered first, then the chat asks with the three language buttons. Never while a step
 * waits for these words or a person holds the chat.
 */
export async function languageForMessage(
  db: DatabaseExecutor,
  chat: Conversation,
  text: string | null,
  stepWaits: boolean,
): Promise<{ language: AssistantLanguage; ask: boolean }> {
  const saved = await chatLanguage(db, chat);
  const keep = { language: saved, ask: false };
  if (saved !== 'en' || !chat.customerId || text === null || chat.state === 'human') return keep;
  const written = scriptLanguage(text);
  if (written === null) return keep;
  if (written !== 'unclear') {
    await saveLanguage(db, chat, written);
    return { language: written, ask: false };
  }
  if (stepWaits || (chat.context as { langAsked?: unknown } | null)?.langAsked) return keep;
  await markContext(db, chat.id, { langAsked: true });
  return { language: saved, ask: true };
}
