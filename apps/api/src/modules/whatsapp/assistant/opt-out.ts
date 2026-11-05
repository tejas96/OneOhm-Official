import { customers, type Database, waConversations } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import type { Conversation } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { markContext } from './chat-step';
import { sayWithTaps } from './closing-taps';
import { localized } from './language';

/** Short and plain, in the three languages; they follow the chat's language. */
export const OPT_OUT_WORDS = localized(
  {
    stopped:
      'You will not get WhatsApp messages from us now. Tap "Start again" whenever you want them back.',
    welcomeBack: 'Welcome back! You will get updates here again.',
    remind:
      'You stopped our WhatsApp messages earlier. We can still reply here. Tap "Start again" to get our updates back.',
  },
  {
    mr: {
      stopped: 'आता तुम्हाला आमचे WhatsApp संदेश मिळणार नाहीत. पुन्हा हवे असतील तेव्हा "पुन्हा सुरू करा" दाबा.',
      welcomeBack: 'पुन्हा स्वागत! तुम्हाला इथे पुन्हा अपडेट मिळतील.',
      remind:
        'तुम्ही आधी आमचे WhatsApp संदेश बंद केले होते. आम्ही इथे उत्तर देऊ शकतो. अपडेट पुन्हा हवे असतील तर "पुन्हा सुरू करा" दाबा.',
    },
    hi: {
      stopped: 'अब आपको हमारे WhatsApp संदेश नहीं मिलेंगे। जब फिर चाहिए हों, "फिर से शुरू करें" दबाएँ।',
      welcomeBack: 'फिर से स्वागत है! आपको यहाँ फिर अपडेट मिलेंगे।',
      remind:
        'आपने पहले हमारे WhatsApp संदेश बंद किए थे। हम यहाँ जवाब दे सकते हैं। अपडेट फिर चाहिए हों तो "फिर से शुरू करें" दबाएँ।',
    },
  },
);

/** Never a bare "बंद" or "रद्द": "inverter बंद" or "booking रद्द" is about the work. */
const STOP_WORDS = new Set(['stop', 'unsubscribe', 'मेसेज बंद', 'संदेश बंद', 'मेसेज नको', 'मैसेज बंद']);
const START_WORDS = new Set(['start', 'सुरू', 'शुरू']);

/** STOP or START when that is the whole message (any case); anything longer is not one. */
export function optOutWord(text: string): 'stop' | 'start' | null {
  const word = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (STOP_WORDS.has(word)) return 'stop';
  return START_WORDS.has(word) ? 'start' : null;
}

/** The words to read for STOP or START: a typed message, or the Start again tap. */
export function optOutAsked(incoming: Pick<Incoming, 'kind' | 'text' | 'choiceId'>): string {
  if (incoming.kind === 'text') return incoming.text;
  return incoming.kind === 'choice' && incoming.choiceId === 'start' ? 'start' : '';
}

/**
 * STOP marks the number opted out and says so once; START or the Start again tap (only
 * from an opted-out number, otherwise it is a hello) clears it. The customer's own record
 * follows in the same step. Returns true when the message was one of these and is answered.
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
    // Each ends with a tap: Start again under STOP, the Menu under START.
    if (stop) await sayWithTaps(tx, chat, OPT_OUT_WORDS.stopped, ['start']);
    else await sayWithTaps(tx, chat, OPT_OUT_WORDS.welcomeBack, ['menu']);
  });
  return true;
}

/**
 * A new contact who stopped our messages and writes again is told once how to start them again (their
 * words are still answered). Once per STOP: the note is remembered in the chat by the time of the STOP.
 */
export async function tellOptedOut(db: Database, chat: Conversation): Promise<void> {
  if (!chat.optedOutAt || chat.customerId || chat.state === 'human') return;
  const stamp = chat.optedOutAt.toISOString();
  if ((chat.context as { optNote?: string } | null)?.optNote === stamp) return;
  await markContext(db, chat.id, { optNote: stamp });
  await sayWithTaps(db, chat, OPT_OUT_WORDS.remind, ['start']);
}

/** STOP and START first, then the once-only note to a stranger who stopped and writes again. */
export async function takeOptOut(
  db: Database,
  chat: Conversation,
  incoming: Pick<Incoming, 'kind' | 'text' | 'choiceId'>,
): Promise<boolean> {
  if (await answerOptOut(db, chat, optOutAsked(incoming))) return true;
  await tellOptedOut(db, chat);
  return false;
}
