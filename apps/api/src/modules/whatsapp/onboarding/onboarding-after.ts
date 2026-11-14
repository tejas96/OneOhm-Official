import { CHAT_WORDS } from '../assistant/chat-words';
import { smallTalkOf } from '../assistant/known-words';
import type { Incoming } from '../whatsapp-events';
import type { EstimateNextStepsService } from './estimate-next-steps';
import { ONBOARD_LISTS } from './onboard-words';
import { MORE_LISTS, MORE_WORDS } from './onboard-words-more';
import { ESTIMATE_CHOICES } from './onboarding-context';
import { say } from './onboarding-pin';
import { speak, type Turn, wantsPerson } from './onboarding-turn';

/**
 * After the estimate (redesign §16) its own taps are answered. "hi" or Menu shows the options again; "ok",
 * "thanks", a 👍, a reaction or a sticker gets a short word; an old tap is told so. Only real words go to the
 * owner, so there is no hand-over loop.
 */
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The next-step buttons' words in every language, so typing a button's words acts as the tap. */
const TYPED: ReadonlyMap<string, string> = new Map([
  ...(['en', 'mr', 'hi'] as const).flatMap((lang) => [
    [plain(MORE_LISTS[lang].bookVisit), ESTIMATE_CHOICES.visit] as const,
    [plain(MORE_LISTS[lang].callMe), ESTIMATE_CHOICES.call] as const,
    [plain(ONBOARD_LISTS[lang].notNow), ESTIMATE_CHOICES.notNow] as const,
  ]),
  ...['book visit', 'site visit', 'visit', 'book a site visit'].map(
    (words) => [words, ESTIMATE_CHOICES.visit] as const,
  ),
  ...['call', 'call me back', 'please call me'].map(
    (words) => [words, ESTIMATE_CHOICES.call] as const,
  ),
]);

/** Typed words that are one of the next-step buttons become that tap. */
export function asTap(incoming: Incoming | null): Incoming | null {
  if (!incoming || incoming.choiceId || incoming.kind !== 'text') return incoming;
  const choiceId = TYPED.get(plain(incoming.text));
  return choiceId ? { ...incoming, kind: 'choice', choiceId } : incoming;
}

export async function afterEstimate(
  turn: Turn,
  given: Incoming | null,
  nextSteps: EstimateNextStepsService,
  then: { readonly toPerson: () => Promise<null>; readonly ask: () => Promise<null> },
): Promise<null> {
  const { tx, chat, lead } = turn;
  const incoming = asTap(given);
  if (incoming && wantsPerson(incoming)) return then.toPerson();
  if (await speak(turn, () => nextSteps.answer(tx, chat, lead, incoming))) return null;
  if (!incoming) return then.ask();
  if (incoming.choiceId) {
    await say(turn, CHAT_WORDS.earlier);
    return then.ask();
  }
  const small = incoming.kind === 'text' && smallTalkOf(incoming.text) !== null;
  if (incoming.kind === 'other' || small) {
    if (!incoming.quiet) await say(turn, MORE_WORDS.afterEstimate);
    return null;
  }
  return then.toPerson();
}
