import { chatsWaitingSince, type Database, waConversations, waMessages } from '@oneohm/database';
import { HAND_BACK_MIN, workingMinutesSince } from '@oneohm/domain';
import { and, eq, sql } from 'drizzle-orm';
import { tellHandedBack } from './assistant/hand-back';
import { keepEntry } from './chat-store';

/** The line the chat's history gets when the assistant takes it back by itself. */
export const HANDED_BACK_NOTE = 'Handed back to the assistant (no reply for 4 working hours)';

/**
 * Chats a person took and then left (live review B4): no team message for 4 working
 * hours since the hand-over or their last reply, and no customer waiting for an answer
 * (those stay with the person; the reminders chase them). They go back to the assistant,
 * with a line in the chat's history in the same transaction, and a customer who wrote
 * since the hand-over is told. Returns how many.
 */
export async function handBackQuietChats(db: Database, now: Date, zone: string): Promise<number> {
  const open = await db
    .select({
      chat: waConversations,
      id: waConversations.id,
      handedOverAt: waConversations.handedOverAt,
      lastReply: sql<string | null>`(select max(o.created_at) from wa_messages o
        where o.conversation_id = ${sql.raw('"wa_conversations"."id"')} and o.direction = 'out'
          and o.sent_by_user_id is not null)`,
    })
    .from(waConversations)
    .where(eq(waConversations.state, 'human'));
  if (open.length === 0) return 0;
  const waiting = await chatsWaitingSince(
    db,
    open.map((chat) => chat.id),
  );
  let handed = 0;
  for (const chat of open) {
    if (waiting.has(chat.id)) continue;
    const times = [chat.handedOverAt, chat.lastReply ? new Date(chat.lastReply) : null];
    const last = Math.max(...times.map((at) => at?.getTime() ?? 0));
    if (last === 0 || workingMinutesSince(new Date(last), now, zone) < HAND_BACK_MIN) continue;
    const moved = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(waConversations)
        .set({
          state: 'menu',
          context: keepEntry({}),
          handedOverAt: null,
          handledByUserId: null,
          updatedAt: new Date(),
        })
        .where(and(eq(waConversations.id, chat.id), eq(waConversations.state, 'human')))
        .returning({ id: waConversations.id });
      if (!row) return false;
      await tx.insert(waMessages).values({
        conversationId: chat.id,
        direction: 'out',
        kind: 'note',
        body: HANDED_BACK_NOTE,
      });
      return true;
    });
    if (!moved) continue;
    handed += 1;
    // A customer who wrote since the hand-over hears their person is away (redesign §14).
    await tellHandedBack(db, chat.chat, chat.handedOverAt);
  }
  return handed;
}
