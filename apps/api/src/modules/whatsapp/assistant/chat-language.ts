import { customers, type DatabaseExecutor, waConversations } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../../common/audit';
import type { Conversation } from '../chat-store';
import { scriptLanguage } from './known-words';
import { type AssistantLanguage, assistantLanguage } from './language';

/**
 * The language to speak in this chat: on the customer's own number, the customer's saved
 * language (the app, staff and this chat all keep it); on a family member's number, the
 * one picked in that chat, else the customer's. A stranger's is the one picked while
 * onboarding.
 */
export async function chatLanguage(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'customerId' | 'language' | 'phone'>,
): Promise<AssistantLanguage> {
  if (!chat.customerId) return assistantLanguage(chat.language);
  const [customer] = await db
    .select({ language: customers.preferredLanguage, phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.id, chat.customerId));
  const family = customer?.phone !== chat.phone;
  return assistantLanguage(family && chat.language ? chat.language : customer?.language);
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
 * at once). `ask` when the words do not tell which, until asked once: the message is
 * answered first, then the chat asks with the three language buttons (not while a step
 * waits for words, before or after the answer, nor while a person holds the chat).
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
  return { language: saved, ask: true };
}
