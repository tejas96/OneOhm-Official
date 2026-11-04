import type { DatabaseExecutor } from '@oneohm/database';
import { isPersonDocumentCategory } from '@oneohm/domain';
import type { CustomerHome } from '../../customer-portal/customer-homes';
import { paperKindWords } from '../../documents/paper-kind-words';
import type { Conversation } from '../chat-store';
import { CHAT_WORDS } from './chat-words';
import { sayWithTaps } from './closing-taps';
import { changeTap } from './files-wait';
import { languageNow } from './language';
import type { OpenPaper } from './paper-match';
import type { Target } from './what-targets';
import { WHAT_WORDS } from './what-words';

/** The asked papers still waiting for this home (an ID paper: for the person). */
export function stillAsked(
  asked: readonly OpenPaper[],
  target: Target,
  homeCount: number,
  answeredId: string | undefined,
): OpenPaper[] {
  return asked.filter((paper) => {
    if (paper.id === answeredId) return false;
    const person = isPersonDocumentCategory(paper.category);
    if (target.home === 'person') return person;
    if (person) return homeCount === 1;
    return paper.propertyId === target.home || (paper.propertyId === null && homeCount === 1);
  });
}

/**
 * "Saved ✅ Electricity bill · Sangli. We'll check it." with [Change] [Menu], and, only when
 * the home still waits for another paper, one line about that one with [Send it now].
 */
export async function saySaved(
  tx: DatabaseExecutor,
  chat: Conversation,
  saved: {
    readonly title: string;
    readonly home: CustomerHome | null;
    readonly count: number;
    readonly firstId: string;
    readonly left: OpenPaper | undefined;
  },
): Promise<void> {
  const home = saved.home?.title ?? null;
  const body =
    saved.count > 1
      ? WHAT_WORDS.savedMany(saved.count, saved.title, home)
      : WHAT_WORDS.saved(saved.title, home);
  await sayWithTaps(tx, chat, body, [
    { id: changeTap(saved.firstId), title: WHAT_WORDS.buttons.change },
    'menu',
  ]);
  if (saved.left)
    await sayWithTaps(tx, chat, WHAT_WORDS.stillNeed(saved.left.title), [
      { id: `sendit:${saved.left.id}`, title: CHAT_WORDS.buttons.sendItNow },
    ]);
}

/** What a picked row is called in the Saved reply: the asked title, or its kind. */
export function savedTitle(asked: OpenPaper | undefined, target: Target): string {
  // An ID paper is named by its kind, not by what the team typed when asking.
  if (asked)
    return isPersonDocumentCategory(asked.category)
      ? paperKindWords(languageNow(), asked.category)
      : asked.title;
  if (target.category === 'other') return WHAT_WORDS.otherFile;
  return paperKindWords(languageNow(), target.category);
}
