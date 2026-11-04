import type { DatabaseExecutor } from '@oneohm/database';
import { type ChatReply, type Conversation, queueReply } from '../chat-store';
import { localized, type Words } from './language';

/**
 * The taps that end every message the bot closes with (live review C5): the customer
 * only taps, never types special words. Each tap is a menu choice the assistant already
 * answers, so a tap works even while a person has the chat. Buttons keep 20 characters.
 */
const EN_TAPS = {
  menu: 'Menu',
  pay: 'Pay now',
  track: 'Track my project',
  talk: 'Talk to us',
  receipt: 'View receipt',
  requests: 'My requests',
  /** Under the STOP reply: answered like typing START. */
  start: 'Start again',
  /** Over the taps when the answer itself is too long for a buttons message. */
  whatNext: 'What next?',
};

const MR_TAPS: Words<typeof EN_TAPS> = {
  menu: 'मेनू',
  pay: 'आता भरा',
  track: 'प्रकल्प पाहा',
  talk: 'आमच्याशी बोला',
  receipt: 'पावती पाहा',
  requests: 'माझ्या विनंत्या',
  start: 'पुन्हा सुरू करा',
  whatNext: 'पुढे काय?',
};

const HI_TAPS: Words<typeof EN_TAPS> = {
  menu: 'मेनू',
  pay: 'अभी भरें',
  track: 'प्रोजेक्ट देखें',
  talk: 'हमसे बात करें',
  receipt: 'रसीद देखें',
  requests: 'मेरे अनुरोध',
  start: 'फिर से शुरू करें',
  whatNext: 'आगे क्या?',
};

/** Every language, for the checks. */
export const TAP_LISTS = { en: EN_TAPS, mr: MR_TAPS, hi: HI_TAPS };
export const TAP_WORDS = localized(EN_TAPS, { mr: MR_TAPS, hi: HI_TAPS });

export type Tap = Exclude<keyof typeof EN_TAPS, 'whatNext'>;

/** What each tap answers: "menu" restarts, the rest are menu rows. */
const TAP_IDS: Record<Tap, string> = {
  menu: 'menu',
  pay: 'payments',
  track: 'progress',
  talk: 'human',
  receipt: 'documents',
  requests: 'requests',
  start: 'start',
};

/** A tap, or a tap that answers one thing (View receipt for one receipt). */
export type TapChoice = Tap | { readonly tap: Tap; readonly id: string };

/** WhatsApp keeps a buttons message's body to 1024 characters. */
const BUTTONS_BODY_LIMIT = 1024;

/**
 * The answer with 1–3 taps under it: one buttons message, or (an answer too long for
 * one) the text and then the taps under "What next?". Call it in the chat's language.
 */
export function withTaps(body: string, taps: readonly TapChoice[]): ChatReply[] {
  if (taps.length === 0 || taps.length > 3) throw new Error('A message ends with 1 to 3 taps.');
  const buttons = taps.map((choice) =>
    typeof choice === 'string'
      ? { id: TAP_IDS[choice], title: TAP_WORDS[choice] }
      : { id: choice.id, title: TAP_WORDS[choice.tap] },
  );
  if (body.length <= BUTTONS_BODY_LIMIT) return [{ kind: 'buttons', body, buttons }];
  return [
    { kind: 'text', body },
    { kind: 'buttons', body: TAP_WORDS.whatNext, buttons },
  ];
}

/** Queues the answer with its taps (see withTaps), with the dedupe key on the first one. */
export async function sayWithTaps(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'id' | 'phone'>,
  body: string,
  taps: readonly TapChoice[],
  dedupeKey?: string,
): Promise<void> {
  for (const [index, reply] of withTaps(body, taps).entries())
    await queueReply(db, chat, reply, null, index === 0 ? dedupeKey : undefined);
}
