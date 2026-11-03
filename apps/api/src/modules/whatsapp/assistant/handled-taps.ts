import { type DatabaseExecutor, waMessages } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import type { Conversation } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { readQuoteTap } from './quote-actions';
import { ALL_MENU_ROWS } from './words';

const MENU_IDS = new Set<string>(ALL_MENU_ROWS.map((row) => row.id));

/**
 * Taps the assistant answers even while a person has the chat (live review B4, B5): the
 * quote buttons, and a customer's menu rows (payments among them). They are the customer
 * choosing the assistant, so they never alert staff; typed words and files still do.
 */
export function assistantAnswersTap(
  chat: Pick<Conversation, 'customerId'>,
  incoming: Pick<Incoming, 'kind' | 'choiceId'>,
): boolean {
  if (incoming.kind !== 'choice' || !incoming.choiceId) return false;
  if (readQuoteTap(incoming.choiceId)) return true;
  return chat.customerId !== null && MENU_IDS.has(incoming.choiceId);
}

/** Marks a logged tap as the assistant's, so it never counts as the customer waiting. */
export async function markAssistantTap(db: DatabaseExecutor, waMessageId: string): Promise<void> {
  await db
    .update(waMessages)
    .set({ assistantTap: true })
    .where(and(eq(waMessages.waMessageId, waMessageId), eq(waMessages.direction, 'in')));
}
