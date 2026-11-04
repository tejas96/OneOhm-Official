import { type DatabaseExecutor, waMessages } from '@oneohm/database';
import { chatWindowOpen } from '@oneohm/domain';
import { and, eq, gt } from 'drizzle-orm';
import { answererName } from '../chat-owner';
import { type Conversation, queueReply } from '../chat-store';
import { chatLanguage } from './chat-language';
import { CHAT_WORDS } from './chat-words';
import { sayWithTaps } from './closing-taps';
import { inLanguage } from './language';

type HeldChat = Pick<
  Conversation,
  | 'id'
  | 'phone'
  | 'customerId'
  | 'language'
  | 'lastInboundAt'
  | 'optedOutAt'
  | 'assignedUserId'
  | 'handledByUserId'
>;

/**
 * The chat went back to the assistant (Release, 4 quiet working hours, or the customer's
 * Menu tap): a customer who wrote since the hand-over hears it, once, in their language
 * (redesign §14). Taps on our own buttons are not "writing". `withMenu` adds the Menu
 * button; the Menu tap itself is answered by Home right after, so it goes without.
 */
export async function tellHandedBack(
  db: DatabaseExecutor,
  chat: HeldChat,
  handedOverAt: Date | null,
  withMenu = true,
): Promise<void> {
  if (!chat.customerId || !handedOverAt || chat.optedOutAt) return;
  if (!chatWindowOpen(chat.lastInboundAt)) return;
  const [wrote] = await db
    .select({ id: waMessages.id })
    .from(waMessages)
    .where(
      and(
        eq(waMessages.conversationId, chat.id),
        eq(waMessages.direction, 'in'),
        eq(waMessages.assistantTap, false),
        gt(waMessages.createdAt, handedOverAt),
      ),
    )
    .limit(1);
  if (!wrote) return;
  const name = await answererName(db, chat);
  await inLanguage(await chatLanguage(db, chat), async () => {
    const body = CHAT_WORDS.handedBack(name);
    if (withMenu) await sayWithTaps(db, chat, body, ['menu']);
    else await queueReply(db, chat, { kind: 'text', body });
  });
}
