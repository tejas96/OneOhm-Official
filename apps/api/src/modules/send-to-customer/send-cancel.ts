import {
  type DatabaseExecutor,
  homeNameOf,
  noticeCustomer,
  waConversations,
} from '@oneohm/database';
import { chatWindowOpen } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { languageOfPhone } from '../documents/document-request-messages';
import { inLanguage } from '../whatsapp/assistant/language';
import { queueReply } from '../whatsapp/chat-store';
import { SEND_WORDS } from './send-words';

/**
 * The team cancelled a location ask, a payment-proof ask or a call-back ask: the customer is
 * told once, in their language: in the app inbox, and in the chat while its window is open
 * (redesign §2.3: "cancel tells the customer").
 */
export async function tellActionCancelled(
  tx: DatabaseExecutor,
  action: {
    readonly id: string;
    readonly type: 'location' | 'pay' | 'callback' | 'visit_pick';
    readonly projectId: string | null;
    readonly propertyId: string | null;
  },
  phone: string,
  userId: string,
): Promise<void> {
  const language = await languageOfPhone(tx, phone);
  await inLanguage(language, async () => {
    const key = `action_cancelled:${action.id}`;
    await noticeCustomer(
      tx,
      phone,
      'action_cancelled',
      {
        what: SEND_WORDS.cancelled.what[action.type],
        ...(action.type === 'pay' ? { note: SEND_WORDS.cancelled.stillDue } : {}),
      },
      key,
    );
    const [chat] = await tx
      .select()
      .from(waConversations)
      .where(eq(waConversations.phone, phone))
      .limit(1);
    if (!chat || chat.optedOutAt || !chatWindowOpen(chat.lastInboundAt)) return;
    const words = SEND_WORDS.cancelled;
    const body =
      action.type === 'location'
        ? words.location(await homeNameOf(tx, action.projectId, action.propertyId))
        : words[action.type];
    await queueReply(tx, chat, { kind: 'text', body }, userId, key);
  });
}
