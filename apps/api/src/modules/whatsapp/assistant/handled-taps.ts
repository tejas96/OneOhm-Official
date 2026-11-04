import { type DatabaseExecutor, waMessages } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import type { Conversation } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { isChoiceTap } from './chat-choices';
import { heldStep } from './chat-step';
import { isPaperTap } from './customer-papers';
import { readQuoteTap } from './quote-actions';

/** The rating rows, the which-home rows of a complaint and of a file, and the which-paper rows. */
/** The stranger buttons (review F5, audit L18). */
const STRANGER_TAPS = new Set(['callback', 'human']);
const OWN_TAP =
  /^(rate:[1-5]|f?home:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|f(home:person|paper:none)|fpaper:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/**
 * Taps the assistant answers even while a person has the chat (live review B4, B5): the
 * quote buttons, and a customer's own buttons and rows (Home, More, Pay ₹X, a language,
 * the old menu ids among them) and paper rows. They are
 * the customer choosing the assistant, so they never alert staff; typed words and files
 * still do. The Menu tap on every closing message, and Start again under the STOP reply,
 * are the bot's own in any chat, since strangers restart too. So are the other taps the
 * bot sends a customer (the ratings and the which-home rows), and a stranger's Call me
 * back and Talk to a person buttons.
 */
export function assistantAnswersTap(
  chat: Pick<Conversation, 'customerId'>,
  incoming: Pick<Incoming, 'kind' | 'choiceId'>,
): boolean {
  if (incoming.kind !== 'choice' || !incoming.choiceId) return false;
  const own = ['menu', 'start'].includes(incoming.choiceId);
  if (own || readQuoteTap(incoming.choiceId)) return true;
  const id = incoming.choiceId;
  if (chat.customerId === null) return STRANGER_TAPS.has(id);
  return isChoiceTap(id) || isPaperTap(id) || OWN_TAP.test(id);
}

/**
 * Everything the assistant answers in a held chat: its own taps, and the words or file a
 * step of its own waits for there (a complaint or a friend's number, menu audit M6).
 */
export function assistantAnswers(
  chat: Pick<Conversation, 'customerId' | 'state' | 'context'>,
  incoming: Pick<Incoming, 'kind' | 'choiceId'>,
): boolean {
  if (assistantAnswersTap(chat, incoming)) return true;
  const step = chat.customerId === null ? null : heldStep(chat);
  // Only the complaint takes a file; a file sent at any other step is for the person.
  if (incoming.kind === 'media') return step === 'await_problem';
  return incoming.kind !== 'choice' && step !== null;
}

/** Marks a logged tap as the assistant's, so it never counts as the customer waiting. */
export async function markAssistantTap(db: DatabaseExecutor, waMessageId: string): Promise<void> {
  await db
    .update(waMessages)
    .set({ assistantTap: true })
    .where(and(eq(waMessages.waMessageId, waMessageId), eq(waMessages.direction, 'in')));
}
