import { findCampaignCode, saysHello } from '@oneohm/domain';
import type { Conversation } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { menuWordChoice } from './menu-words';
import { ALL_MENU_ROWS, MENU_ROWS, type MenuChoice } from './words';

const GREETINGS = new Set(['hi', 'hii', 'hello', 'hey', 'start', 'namaste', 'namaskar']);
const greets = (word: string) => GREETINGS.has(word) || menuWordChoice(word) === 'menu';

/** What the customer sent, read as one word: a tap's id, or the typed words. */
export const wordOf = (incoming: Pick<Incoming, 'choiceId' | 'text'>) =>
  (incoming.choiceId ?? incoming.text).trim().toLowerCase();

/** A menu row picked by its number, its id, its title in any language, or a plain word. */
export function menuChoice(word: string): MenuChoice | undefined {
  if (/^\d{1,2}$/.test(word)) return MENU_ROWS[Number(word) - 1]?.id;
  const row = ALL_MENU_ROWS.find((row) => row.id === word || row.title.toLowerCase() === word);
  const plain = menuWordChoice(word);
  return row?.id ?? (plain === 'menu' ? undefined : plain);
}

/**
 * True when the message shows the first menu again: a hello, Menu, or a new number's ad
 * opener such as "Hi OneOhm DIWALI26". While a person holds the chat (menu audit M5) a
 * typed hello is for that person; only the Menu tap or the typed word "menu" restarts.
 */
export function restartsChat(
  chat: Pick<Conversation, 'state' | 'customerId'>,
  incoming: Pick<Incoming, 'kind' | 'choiceId' | 'text'>,
): boolean {
  const word = wordOf(incoming);
  if (chat.state === 'human')
    return incoming.kind === 'choice' ? greets(word) : menuWordChoice(word) === 'menu';
  if (greets(word) || saysHello(incoming.text)) return true;
  return !chat.customerId && findCampaignCode(incoming.text) !== null;
}

/** A short thanks or ack in any of the three languages (review F7). */
const THANKS = new Set([
  'ok',
  'okay',
  'thanks',
  'thank you',
  'धन्यवाद',
  'ठीक आहे',
  'ठीक है',
  'शुक्रिया',
]);
const ONLY_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

/** True for "ok", "thanks", धन्यवाद… or a message of emoji only: answered, not handed over. */
export function isThanks(text: string): boolean {
  const said = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/u, '');
  return THANKS.has(said) || (said !== '' && ONLY_EMOJI.test(said));
}
