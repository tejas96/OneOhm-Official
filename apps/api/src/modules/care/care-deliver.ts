import {
  customers,
  type DatabaseExecutor,
  messageTemplates,
  noticeCustomer,
  queueCustomerMessage,
} from '@oneohm/database';
import { templateIsOn } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { languageOfPhone } from '../documents/document-request-messages';
import { chatOpenFor } from '../send-to-customer/send-context';
import { inLanguage } from '../whatsapp/assistant/language';
import type { ChatReply } from '../whatsapp/chat-reply';
import { conversationForPhone, queueReply } from '../whatsapp/chat-store';

/**
 * One message of the care flows (problem fixed, UPI ask, AMC renewal, a payout's paid line). Inside the
 * 24-hour window, and when the customer has not said STOP, it is the chat message with its buttons (free
 * text needs no template). Outside it the approved template goes, once its switch is on; while it is off
 * `fallback` runs (the older message that always went), or nothing is sent. Returns where it went.
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
  const [customer] = await tx
    .select({ optIn: customers.whatsappOptIn })
    .from(customers)
    .where(eq(customers.phoneE164, person.phone))
    .limit(1);
  if (customer?.optIn !== false && (await chatOpenFor(tx, person.phone))) {
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
