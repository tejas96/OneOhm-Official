import { type DatabaseExecutor, waMessages } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { tellChatTeam } from './chat-owner';
import type { Conversation } from './chat-store';
import type { Incoming } from './whatsapp-events';

/**
 * A tap (button or list reply) on a message older than the chat's newest one: Meta
 * delivered it late, so acting on it would move the chat back. Meta's times are whole
 * seconds, so only a tap a full second older counts as late.
 */
export function isLateTap(chat: Pick<Conversation, 'lastInboundAt'>, message: Incoming): boolean {
  if (message.kind !== 'choice' || !chat.lastInboundAt) return false;
  return message.at.getTime() + 1000 <= chat.lastInboundAt.getTime();
}

/** Forgets a saved incoming message that could not be handled, so Meta's retry is handled. */
export async function forgetIncoming(db: DatabaseExecutor, waMessageId: string): Promise<void> {
  await db
    .delete(waMessages)
    .where(and(eq(waMessages.waMessageId, waMessageId), eq(waMessages.direction, 'in')));
}

/** One alert to the chat's people per message that failed, however often Meta retries it. */
export async function tellNotHandled(
  db: DatabaseExecutor,
  chat: Conversation,
  message: Incoming,
): Promise<void> {
  const name = chat.profileName ?? chat.phone;
  await tellChatTeam(db, chat, {
    kind: 'whatsapp_not_handled',
    title: 'A WhatsApp message was not handled',
    // The message itself is forgotten so Meta's retry is handled: the alert keeps its words.
    body: `A WhatsApp message from ${name} could not be handled — please check the chat. They sent: ${message.text ? message.text.slice(0, 140) : 'a file'}`,
    key: `wa_not_handled:${message.waMessageId}`,
  });
}
