import { customers, type Database, waConversations } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { type Conversation, queueReply } from '../chat-store';
import { localized } from './language';

/** Short and plain, in the three languages; they follow the language of the message. */
export const OPT_OUT_WORDS = localized(
  {
    stopped: 'You will not get WhatsApp messages from us now. Send START anytime to begin again.',
    welcomeBack: 'Welcome back! You will get updates here again.',
  },
  {
    mr: {
      stopped: 'आता तुम्हाला आमचे WhatsApp संदेश मिळणार नाहीत. पुन्हा सुरू करण्यासाठी केव्हाही START पाठवा.',
      welcomeBack: 'पुन्हा स्वागत! तुम्हाला इथे पुन्हा अपडेट मिळतील.',
    },
    hi: {
      stopped: 'अब आपको हमारे WhatsApp संदेश नहीं मिलेंगे। दोबारा शुरू करने के लिए कभी भी START भेजें।',
      welcomeBack: 'फिर से स्वागत है! आपको यहाँ फिर अपडेट मिलेंगे।',
    },
  },
);

const STOP_WORDS = new Set(['stop', 'unsubscribe', 'बंद', 'रद्द']);
const START_WORDS = new Set(['start', 'सुरू', 'शुरू']);

/** STOP or START when that is the whole message (any case); anything longer is not one. */
export function optOutWord(text: string): 'stop' | 'start' | null {
  const word = text.trim().toLowerCase();
  if (STOP_WORDS.has(word)) return 'stop';
  return START_WORDS.has(word) ? 'start' : null;
}

/**
 * STOP marks the number opted out and says so once; START (only from an opted-out number,
 * otherwise it is a hello) clears it. The customer's own record follows in the same step.
 * Returns true when the message was one of these and is answered.
 */
export async function answerOptOut(
  db: Database,
  chat: Conversation,
  text: string,
): Promise<boolean> {
  const word = optOutWord(text);
  if (!word || (word === 'start' && !chat.optedOutAt)) return false;
  const stop = word === 'stop';
  await db.transaction(async (tx) => {
    await tx
      .update(waConversations)
      .set({ optedOutAt: stop ? new Date() : null })
      .where(eq(waConversations.id, chat.id));
    await tx
      .update(customers)
      .set({ whatsappOptIn: !stop })
      .where(eq(customers.phoneE164, chat.phone));
    await queueReply(tx, chat, {
      kind: 'text',
      body: stop ? OPT_OUT_WORDS.stopped : OPT_OUT_WORDS.welcomeBack,
    });
  });
  return true;
}
