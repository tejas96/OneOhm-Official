import { inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { waConversations } from './schema/whatsapp.schema';

/**
 * Since when each chat has waited for a person: the customer's first message after a
 * team member last replied, or the hand-over itself when the customer asked for a person
 * after that reply. Taps the assistant answers even with a person (menu rows, quote
 * buttons: `assistant_tap`) do not wait; other taps, typed words and files do, and the assistant's own words and automatic updates are not an answer. Never
 * before the hand-over; chats with nothing unanswered are left out.
 */
export async function chatsWaitingSince(
  db: DatabaseExecutor,
  conversationIds: readonly string[],
): Promise<Map<string, Date>> {
  if (conversationIds.length === 0) return new Map();
  // Spelled out: drizzle leaves a lone table's columns unqualified, which a subquery misreads.
  const chatId = sql.raw('"wa_conversations"."id"');
  const answered = sql`coalesce((select max(o.created_at) from wa_messages o
    where o.conversation_id = ${chatId} and o.direction = 'out'
      and o.sent_by_user_id is not null), '-infinity'::timestamptz)`;
  const rows = await db
    .select({
      id: waConversations.id,
      handedOverAt: waConversations.handedOverAt,
      askedAfter: sql<boolean>`${waConversations.handedOverAt} > ${answered}`,
      firstWords: sql<string | null>`(select min(m.created_at) from wa_messages m
        where m.conversation_id = ${chatId} and m.direction = 'in'
          and not m.assistant_tap and m.created_at > ${answered})`,
    })
    .from(waConversations)
    .where(inArray(waConversations.id, [...conversationIds]));
  const waiting = new Map<string, Date>();
  for (const row of rows) {
    const handedOver = row.handedOverAt;
    if (row.askedAfter && handedOver) waiting.set(row.id, handedOver);
    else if (row.firstWords) {
      const words = new Date(row.firstWords);
      waiting.set(row.id, handedOver && handedOver > words ? handedOver : words);
    }
  }
  return waiting;
}
