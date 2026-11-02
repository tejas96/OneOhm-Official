import { eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { waConversations, waMessages } from './schema/whatsapp.schema';

/**
 * Since when each chat has waited for a person: the customer's first message after a
 * team member last replied. The assistant's own words and automatic updates do not
 * count as an answer. Chats with nothing unanswered are left out.
 */
export async function chatsWaitingSince(
  db: DatabaseExecutor,
  conversationIds: readonly string[],
): Promise<Map<string, Date>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: waMessages.conversationId,
      // Never before the hand-over: older assistant-only chatter is not a person's wait.
      since: sql<string>`greatest(min(${waMessages.createdAt}), max(${waConversations.handedOverAt}))`,
    })
    .from(waMessages)
    .innerJoin(waConversations, eq(waConversations.id, waMessages.conversationId))
    .where(
      sql`${inArray(waMessages.conversationId, [...conversationIds])} and ${waMessages.direction} = 'in' and ${waMessages.createdAt} > coalesce((select max(o.created_at) from wa_messages o where o.conversation_id = ${waMessages.conversationId} and o.direction = 'out' and o.sent_by_user_id is not null), '-infinity'::timestamptz)`,
    )
    .groupBy(waMessages.conversationId);
  return new Map(rows.map((row) => [row.id, new Date(row.since)]));
}
