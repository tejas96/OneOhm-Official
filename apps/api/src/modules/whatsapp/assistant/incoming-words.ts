import { findCampaignCode, saysHello } from '@oneohm/domain';
import type { Conversation } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { type Choice, choiceOfTap } from './chat-choices';
import { isHello, isMenuWord, knownChoice } from './known-words';

/** What the customer sent, read as one word: a tap's id, or the typed words. */
export const wordOf = (incoming: Pick<Incoming, 'choiceId' | 'text'>) =>
  (incoming.choiceId ?? incoming.text).trim().toLowerCase();

/**
 * The answer a message picks: a tap on one of our buttons or rows (old menu ids too), or
 * typed words we know ("payments", "when will you come?"). Typed numbers pick nothing
 * (redesign decision 8: the 1–10 shortcuts are gone).
 */
export function choiceOf(
  incoming: Pick<Incoming, 'kind' | 'choiceId' | 'text'>,
): Choice | undefined {
  if (incoming.kind === 'choice') return choiceOfTap(incoming.choiceId);
  if (incoming.kind !== 'text') return undefined;
  return knownChoice(incoming.text);
}

/**
 * True when the message shows Home again: a hello, the Menu tap, the typed word "menu",
 * or a new number's ad opener such as "Hi OneOhm DIWALI26". While a person holds the chat
 * (menu audit M5) a typed hello is for that person; only Menu (tapped or typed) restarts.
 */
export function restartsChat(
  chat: Pick<Conversation, 'state' | 'customerId'>,
  incoming: Pick<Incoming, 'kind' | 'choiceId' | 'text'>,
): boolean {
  if (incoming.kind === 'choice') return ['menu', 'start'].includes(incoming.choiceId ?? '');
  if (incoming.kind !== 'text') return false;
  if (chat.state === 'human') return isMenuWord(incoming.text);
  if (isMenuWord(incoming.text) || isHello(incoming.text) || saysHello(incoming.text)) return true;
  return !chat.customerId && findCampaignCode(incoming.text) !== null;
}
