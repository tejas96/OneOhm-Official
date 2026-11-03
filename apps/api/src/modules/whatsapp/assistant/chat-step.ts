import type { DatabaseExecutor } from '@oneohm/database';
import { type Conversation, setState } from '../chat-store';

/** The bot's own steps that wait for the customer's next words or tap. */
export const WAITING_STEPS = ['await_home', 'await_problem', 'await_referral', 'await_comment'];

type Chat = Pick<Conversation, 'state' | 'context'>;

/**
 * The step a held chat waits on (menu audit M6): while a person holds the chat it stays
 * `human` (so the reminders go on) and the bot's step lives in its context. Null for none.
 */
export function heldStep(chat: Chat): string | null {
  if (chat.state !== 'human') return null;
  const step = (chat.context as { step?: unknown } | null)?.step;
  return typeof step === 'string' && WAITING_STEPS.includes(step) ? step : null;
}

/** What the chat waits on now: its state, or the step inside a person's hold. */
export const stepOf = (chat: Chat): string => heldStep(chat) ?? chat.state;

/**
 * Moves the chat to a step ('menu' ends one). A held chat stays with its person: only the
 * step in its context changes, so Raise a complaint or Rate us never ends the hold.
 */
export function setStep(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'id' | 'state'>,
  step: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  if (chat.state !== 'human') return setState(db, chat.id, step, context);
  return setState(db, chat.id, 'human', step === 'menu' ? context : { ...context, step });
}
