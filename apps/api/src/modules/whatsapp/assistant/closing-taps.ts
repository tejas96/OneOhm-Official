import type { DatabaseExecutor } from '@oneohm/database';
import { type ChatReply, type Conversation, queueReply } from '../chat-store';
import { CHAT_WORDS } from './chat-words';

/**
 * The taps that end every bot message (live review C5, principles §3): the next likely
 * step, then the way out. Titles come from the one chat dictionary (chat-words.ts).
 */
const TAPS = {
  menu: { id: 'menu', title: 'menu' },
  more: { id: 'go:more', title: 'more' },
  update: { id: 'go:update', title: 'update' },
  payments: { id: 'go:payments', title: 'payments' },
  documents: { id: 'go:documents', title: 'documents' },
  problem: { id: 'go:problem', title: 'problem' },
  problems: { id: 'go:problems', title: 'problems' },
  receipts: { id: 'go:receipts', title: 'receipts' },
  refer: { id: 'go:refer', title: 'refer' },
  rewards: { id: 'go:rewards', title: 'rewards' },
  talk: { id: 'go:talk', title: 'talkTeam' },
  /** Under the STOP reply: answered like typing START. */
  start: { id: 'start', title: 'start' },
  /** After a payment, with that receipt's own id. */
  receipt: { id: 'go:receipts', title: 'viewReceipt' },
} as const satisfies Record<string, { id: string; title: keyof typeof CHAT_WORDS.buttons }>;

export type Tap = keyof typeof TAPS;

/** A tap; a tap that answers one thing (View receipt for one receipt); or any own button. */
export type TapChoice =
  | Tap
  | { readonly tap: Tap; readonly id: string }
  | { readonly id: string; readonly title: string };

/** WhatsApp keeps a buttons message's body to 1024 characters. */
const BUTTONS_BODY_LIMIT = 1024;

/** The button a tap choice stands for, in the language being spoken. */
export function tapButton(choice: TapChoice): { id: string; title: string } {
  if (typeof choice === 'string')
    return { id: TAPS[choice].id, title: CHAT_WORDS.buttons[TAPS[choice].title] };
  if ('tap' in choice) return { id: choice.id, title: CHAT_WORDS.buttons[TAPS[choice.tap].title] };
  return choice;
}

/**
 * The answer with 1–3 taps under it: one buttons message, or (an answer too long for
 * one) the text and then the taps under "What next?". Call it in the chat's language.
 */
export function withTaps(body: string, taps: readonly TapChoice[]): ChatReply[] {
  if (taps.length === 0 || taps.length > 3) throw new Error('A message ends with 1 to 3 taps.');
  const buttons = taps.map(tapButton);
  if (body.length <= BUTTONS_BODY_LIMIT) return [{ kind: 'buttons', body, buttons }];
  return [
    { kind: 'text', body },
    { kind: 'buttons', body: CHAT_WORDS.whatNext, buttons },
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
