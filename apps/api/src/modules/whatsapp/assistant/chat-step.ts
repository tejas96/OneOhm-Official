import type { DatabaseExecutor } from '@oneohm/database';
import { type Conversation, setState } from '../chat-store';

/** The bot's own steps that wait for the customer's next words or tap. */
export const WAITING_STEPS = [
  'await_home',
  'await_problem',
  'await_referral',
  'await_comment',
  'await_file_home',
  'await_file_paper',
];

/** A step waits this long; older, the customer's words are read as new ones (to a person). */
export const STEP_MINUTES = 30;

type Chat = Pick<Conversation, 'state' | 'context'>;

/** False for a step set more than STEP_MINUTES ago (one set before steps had a time counts). */
function fresh(chat: Chat, now: number): boolean {
  const at = (chat.context as { stepAt?: unknown } | null)?.stepAt;
  return typeof at !== 'number' || now - at <= STEP_MINUTES * 60_000;
}

/**
 * The step a held chat waits on (menu audit M6): while a person holds the chat it stays
 * `human` (so the reminders go on) and the bot's step lives in its context. Null for none,
 * or for a step older than STEP_MINUTES.
 */
export function heldStep(chat: Chat, now = Date.now()): string | null {
  if (chat.state !== 'human') return null;
  const step = (chat.context as { step?: unknown } | null)?.step;
  if (typeof step !== 'string' || !WAITING_STEPS.includes(step)) return null;
  return fresh(chat, now) ? step : null;
}

/** What the chat waits on now: its state, or the step inside a person's hold; 'menu' once stale. */
export function stepOf(chat: Chat, now = Date.now()): string {
  if (chat.state === 'human') return heldStep(chat, now) ?? 'human';
  if (WAITING_STEPS.includes(chat.state) && !fresh(chat, now)) return 'menu';
  return chat.state;
}

/**
 * Moves the chat to a step ('menu' ends one), with the time it was set. A held chat stays
 * with its person: only the step in its context changes, so Raise a complaint or Rate us
 * never ends the hold.
 */
export function setStep(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'id' | 'state'>,
  step: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  const timed = step === 'menu' ? context : { ...context, stepAt: Date.now() };
  if (chat.state !== 'human') return setState(db, chat.id, step, timed);
  return setState(db, chat.id, 'human', step === 'menu' ? context : { ...timed, step });
}
