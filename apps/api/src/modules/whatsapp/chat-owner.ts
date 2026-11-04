import { chatOwnerFor, type DatabaseExecutor, waConversations, waMessages } from '@oneohm/database';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Conversation } from './chat-store';

// Who hears about a chat lives with the database, so the worker can alert the same people.
export { chatOwnerFor, deskFor, tellChatTeam } from '@oneohm/database';

/** Gives an unowned chat its owner (or `fallback`, such as the person opening it). */
export async function ensureChatOwner<T extends Conversation>(
  db: DatabaseExecutor,
  chat: T,
  fallback: string | null = null,
): Promise<T> {
  if (chat.assignedUserId) return chat;
  const owner = (await chatOwnerFor(db, chat)) ?? fallback;
  if (!owner) return chat;
  await db
    .update(waConversations)
    .set({ assignedUserId: owner })
    .where(and(eq(waConversations.id, chat.id), isNull(waConversations.assignedUserId)));
  return { ...chat, assignedUserId: owner };
}

/**
 * A project got a manager: the customer's chat moves to them, unless another person
 * answered it in the last 24 hours (a conversation in progress stays where it is).
 */
export async function moveCustomerChats(
  db: DatabaseExecutor,
  customerId: string,
  toUserId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const moved = await db
    .update(waConversations)
    .set({ assignedUserId: toUserId, updatedAt: new Date() })
    .where(
      and(
        eq(waConversations.customerId, customerId),
        sql`not exists (select 1 from ${waMessages} where ${waMessages.conversationId} = ${waConversations.id} and ${waMessages.direction} = 'out' and ${waMessages.sentByUserId} is not null and ${waMessages.sentByUserId} <> ${toUserId} and ${waMessages.createdAt} > ${since})`,
      ),
    )
    .returning({ id: waConversations.id });
  return moved.length;
}
