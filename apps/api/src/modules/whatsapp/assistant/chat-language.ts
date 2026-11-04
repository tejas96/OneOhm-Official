import { customers, type DatabaseExecutor, waConversations } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import type { Conversation } from '../chat-store';
import { markContext } from './chat-step';
import { scriptLanguage } from './known-words';
import { type AssistantLanguage, assistantLanguage } from './language';

/** A customer's saved language; a stranger's is the one picked while onboarding. */
export async function chatLanguage(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'customerId' | 'language'>,
): Promise<AssistantLanguage> {
  if (!chat.customerId) return assistantLanguage(chat.language);
  const [customer] = await db
    .select({ language: customers.preferredLanguage })
    .from(customers)
    .where(eq(customers.id, chat.customerId));
  return assistantLanguage(customer?.language);
}

/**
 * The language the customer picked in the chat (or wrote in): kept on the customer, as the
 * app's setting is, and on the chat, so every message after is in it.
 */
export async function saveLanguage(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'id' | 'customerId'>,
  language: AssistantLanguage,
): Promise<void> {
  await db
    .update(waConversations)
    .set({ language, updatedAt: new Date() })
    .where(eq(waConversations.id, chat.id));
  if (chat.customerId)
    await db
      .update(customers)
      .set({ preferredLanguage: `${language}-IN`, updatedAt: new Date() })
      .where(eq(customers.id, chat.customerId));
}

/**
 * The language to answer this message in (principles §2): the saved one, or, when that is
 * English and a known customer types in Devanagari, Marathi or Hindi by its words (saved
 * at once). 'ask' when the words do not tell which, the first time only: the chat then
 * asks with the three language buttons. Never while a step waits for these words.
 */
export async function languageForMessage(
  db: DatabaseExecutor,
  chat: Conversation,
  text: string | null,
  stepWaits: boolean,
): Promise<AssistantLanguage | 'ask'> {
  const saved = await chatLanguage(db, chat);
  if (saved !== 'en' || !chat.customerId || text === null || chat.state === 'human') return saved;
  const written = scriptLanguage(text);
  if (written === null) return saved;
  if (written !== 'unclear') {
    await saveLanguage(db, chat, written);
    return written;
  }
  if (stepWaits || (chat.context as { langAsked?: unknown } | null)?.langAsked) return saved;
  await markContext(db, chat.id, { langAsked: true });
  return 'ask';
}
