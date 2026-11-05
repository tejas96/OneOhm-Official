import {
  type DatabaseExecutor,
  messageTemplates,
  noticeCustomer,
  queueCustomerMessage,
} from '@oneohm/database';
import { templateIsOn } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { languageOfPhone } from '../documents/document-request-messages';
import { mayChat } from '../journey/auto-messages';
import { inLanguage } from '../whatsapp/assistant/language';
import type { ChatReply } from '../whatsapp/chat-reply';
import { conversationForPhone, queueReply } from '../whatsapp/chat-store';

/**
 * One message of the care flows (problem fixed, UPI ask, AMC renewal, a payout's paid line). It is the chat
 * message with its buttons when the window is open, the customer has not said STOP and the message's switch
 * is on (`mayChat`, the worker's rule). Otherwise the approved template goes, once its switch is on; while it
 * is off `fallback` runs (the older message that always went), or nothing is sent and the caller tells
 * staff. Returns where it went.
 */
export async function deliverCare(
  tx: DatabaseExecutor,
  person: { readonly phone: string },
  message: {
    readonly template: string;
    readonly payload: Record<string, string>;
    readonly key: string;
    readonly reply: () => Promise<ChatReply>;
    readonly fallback?: () => Promise<void>;
  },
): Promise<'chat' | 'template' | 'fallback' | 'none'> {
  // The chat message follows the template's switch, the window and STOP (the worker's rule too).
  if (await mayChat(tx, person.phone, message.template)) {
    const chat = await conversationForPhone(tx, person.phone);
    const language = await languageOfPhone(tx, person.phone);
    await queueReply(tx, chat, await inLanguage(language, message.reply), null, message.key);
    await noticeCustomer(tx, person.phone, message.template, message.payload, message.key);
    return 'chat';
  }
  const [row] = await tx
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, message.template))
    .limit(1);
  if (templateIsOn(message.template, row)) {
    await queueCustomerMessage(tx, person.phone, message.template, message.payload, message.key);
    return 'template';
  }
  if (message.fallback) {
    await message.fallback();
    return 'fallback';
  }
  return 'none';
}
