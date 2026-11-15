import {
  type DatabaseExecutor,
  type LeadAttribution,
  waConversations,
  waMessages,
} from '@oneohm/database';
import type { MetaWebhookEvent } from '@oneohm/marketing';
import { eq, sql } from 'drizzle-orm';
import { ownerByRule } from '../crm/lead-owner';
import type { Conversation } from '../whatsapp/chat-store';
import { type SocialChannel, socialPhone } from '../whatsapp/social-reply';

export type SocialEvent = Extract<MetaWebhookEvent, { kind: 'message' | 'comment' }>;

/** How the chat first looked: who the person is and who should answer. */
export interface NewChatFacts {
  readonly profileName: string | null;
  readonly city: string;
}

/**
 * The chat for this person: made on first contact (answered by a person, never the
 * assistant, owned by whoever the lead rule picks), else its last message time moves up.
 * `isNew` is true only for the call that made it.
 */
export async function socialChatFor(
  db: DatabaseExecutor,
  event: SocialEvent,
  facts: () => Promise<NewChatFacts>,
): Promise<{ chat: Conversation; isNew: boolean }> {
  const phone = socialPhone(event.channel, event.senderId);
  const [existing] = await db
    .select()
    .from(waConversations)
    .where(eq(waConversations.phone, phone));
  if (!existing) {
    const known = await facts();
    const owner = await ownerByRule(db, { city: known.city });
    const [made] = await db
      .insert(waConversations)
      .values({
        phone,
        channel: event.channel,
        profileName: known.profileName,
        state: 'human',
        lastInboundAt: event.at,
        assignedUserId: owner?.userId ?? null,
      })
      .onConflictDoNothing({ target: waConversations.phone })
      .returning();
    if (made) return { chat: made, isNew: true };
  }
  // Meta can deliver an older event late: the chat keeps its newest time.
  const [chat] = await db
    .update(waConversations)
    .set({
      state: 'human',
      lastInboundAt: sql`greatest(${waConversations.lastInboundAt}, ${event.at.toISOString()}::timestamptz)`,
      updatedAt: new Date(),
    })
    .where(eq(waConversations.phone, phone))
    .returning();
  if (!chat) throw new Error('Social chat upsert returned nothing.');
  return { chat, isNew: false };
}

/** The message id and the words the chat history shows for an event. */
export function socialLine(event: SocialEvent): { id: string; body: string } {
  if (event.kind === 'comment')
    return {
      id: `meta:comment:${event.commentId}`,
      body: `Commented on your post: ${event.text}`.slice(0, 1000),
    };
  return { id: `meta:${event.messageId}`, body: event.text || '(photo)' };
}

/** Saves an incoming social message; false when this one was already saved. */
export async function logSocial(
  db: DatabaseExecutor,
  chatId: string,
  event: SocialEvent,
): Promise<boolean> {
  const line = socialLine(event);
  const saved = await db
    .insert(waMessages)
    .values({
      conversationId: chatId,
      direction: 'in',
      waMessageId: line.id,
      kind: 'text',
      body: line.body,
    })
    .onConflictDoNothing()
    .returning({ id: waMessages.id });
  return saved.length > 0;
}

/**
 * Merges into the chat's context in the database. A saved `entry` is never replaced (first
 * touch wins); every other key is set.
 */
export async function remember(
  db: DatabaseExecutor,
  chatId: string,
  patch: Record<string, unknown>,
  entry?: LeadAttribution | null,
): Promise<void> {
  const first = entry
    ? sql`jsonb_build_object('entry', ${JSON.stringify(entry)}::jsonb) ||`
    : sql``;
  await db
    .update(waConversations)
    .set({
      context: sql`${first} (coalesce(${waConversations.context}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb)`,
    })
    .where(eq(waConversations.id, chatId));
}

export const channelOf = (chat: { channel: string }): SocialChannel =>
  chat.channel === 'instagram' ? 'instagram' : 'messenger';
