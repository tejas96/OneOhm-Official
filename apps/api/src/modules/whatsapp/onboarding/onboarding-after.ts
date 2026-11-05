import { CHAT_WORDS } from '../assistant/chat-words';
import { smallTalkOf } from '../assistant/known-words';
import type { Incoming } from '../whatsapp-events';
import type { EstimateNextStepsService } from './estimate-next-steps';
import { MORE_WORDS } from './onboard-words-more';
import { say } from './onboarding-pin';
import { speak, type Turn, wantsPerson } from './onboarding-turn';

/**
 * After the estimate (redesign §16) its own taps are answered. "hi" or Menu shows the options again; "ok",
 * "thanks", a 👍, a reaction or a sticker gets a short word; an old tap is told so. Only real words go to the
 * owner, so there is no hand-over loop.
 */
export async function afterEstimate(
  turn: Turn,
  incoming: Incoming | null,
  nextSteps: EstimateNextStepsService,
  then: { readonly toPerson: () => Promise<null>; readonly ask: () => Promise<null> },
): Promise<null> {
  const { tx, chat, lead } = turn;
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
