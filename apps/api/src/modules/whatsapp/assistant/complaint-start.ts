import type { DatabaseExecutor } from '@oneohm/database';
import { careTaps, PROBLEM_KINDS, SINCE_CHOICES } from '../../care/care-taps';
import { PROBLEM_WORDS } from '../../care/problem-words';
import { activeHomes } from '../../customer-portal/active-projects';
import { type Conversation, queueReply } from '../chat-store';
import { setStep } from './chat-step';
import { keepPending } from './media-intake';
import { PROJECT_WORDS } from './project-words';
import { WORDS } from './words';

/** A list keeps 10 rows. */
const HOME_ROWS = 10;
const HOME_TAP = /^home:([0-9a-f-]{36})$/;

/** The project a which-home row was tapped for, or null for any other tap. */
export const homeTapped = (choiceId: string | null) => HOME_TAP.exec(choiceId ?? '')?.[1] ?? null;

/**
 * The problem being reported in the chat, one tap at a time (redesign §12): home (2 or more homes) ·
 * what is wrong · since when · then photos or words if the customer likes, closed by [Done]. The category
 * is the tap, never a guess. Kept in the chat's memory until the problem is raised.
 */
export interface Draft {
  readonly stage: 'what' | 'since' | 'extra';
  readonly projectId?: string | null;
  /** "installation": the problem started from the installation check. */
  readonly topic?: string | undefined;
  readonly kind?: (typeof PROBLEM_KINDS)[number];
  readonly since?: (typeof SINCE_CHOICES)[number];
  /** Photos and voice notes sent while the questions were asked (stored documents). */
  readonly files?: readonly string[];
}

/** The draft in the chat's memory, or null when no problem is being reported. */
export function draftOf(context: unknown): Draft | null {
  const draft = (context as { problem?: Draft } | null)?.problem;
  return draft?.stage ? draft : null;
}

const remember = (db: DatabaseExecutor, chat: Conversation, draft: Draft) =>
  setStep(db, chat, 'await_problem', { ...keepPending(chat.context), problem: draft });

/**
 * "Report a problem" in the chat: a customer with 2 or more active homes first picks which one, as a
 * list of towns; with one, the first question comes at once. Photos sent before are kept for the report.
 */
export async function startComplaint(
  db: DatabaseExecutor,
  chat: Conversation,
  customerId: string,
  topic?: string,
): Promise<void> {
  const homes = await activeHomes(db, customerId);
  if (homes.length < 2)
    return askWhat(db, chat, { stage: 'what', projectId: homes[0]?.id ?? null, topic });
  await setStep(db, chat, 'await_home', {
    ...keepPending(chat.context),
    ...(topic ? { topic } : {}),
  });
  await queueReply(db, chat, {
    kind: 'list',
    body: PROJECT_WORDS.whichHome,
    button: WORDS.menuButton,
    rows: homes.slice(0, HOME_ROWS).map((home) => ({
      id: `home:${home.id}`,
      title: home.city.slice(0, 24),
      description: home.site.slice(0, 72),
    })),
  });
}

/**
 * A home picked from the list: the report goes on it. One no longer active is said so, then the list
 * again, or the first question at once when one home is left.
 */
export async function pickHome(
  db: DatabaseExecutor,
  chat: Conversation,
  customerId: string,
  projectId: string,
): Promise<void> {
  const homes = await activeHomes(db, customerId);
  const topic = (chat.context as { topic?: string } | null)?.topic;
  if (!homes.some((home) => home.id === projectId)) {
    await queueReply(db, chat, { kind: 'text', body: PROJECT_WORDS.homeGone });
    return startComplaint(db, chat, customerId, topic);
  }
  return askWhat(db, chat, { stage: 'what', projectId, topic });
}

/** "What is wrong?" as a list. */
export async function askWhat(db: DatabaseExecutor, chat: Conversation, draft: Draft) {
  await remember(db, chat, { ...draft, stage: 'what' });
  await queueReply(db, chat, {
    kind: 'list',
    body: PROBLEM_WORDS.askWhat,
    button: PROBLEM_WORDS.pick,
    rows: PROBLEM_KINDS.map((kind) => ({
      id: careTaps.what(kind),
      title: PROBLEM_WORDS.what[kind],
    })),
  });
}

/** "Since when?" as three buttons. */
export async function askSince(db: DatabaseExecutor, chat: Conversation, draft: Draft) {
  await remember(db, chat, { ...draft, stage: 'since' });
  await queueReply(db, chat, {
    kind: 'buttons',
    body: PROBLEM_WORDS.askSince,
    buttons: SINCE_CHOICES.map((since) => ({
      id: careTaps.since(since),
      title: PROBLEM_WORDS.since[since],
    })),
  });
}

/** Photos or a few words, closed by [Done]. */
export async function askExtra(db: DatabaseExecutor, chat: Conversation, draft: Draft) {
  await remember(db, chat, { ...draft, stage: 'extra' });
  await queueReply(db, chat, {
    kind: 'buttons',
    body: PROBLEM_WORDS.addOn,
    buttons: [{ id: careTaps.done, title: PROBLEM_WORDS.done }],
  });
}

/** The question the draft is at, again (a photo or words came before it was answered). */
export function askAgain(db: DatabaseExecutor, chat: Conversation, draft: Draft) {
  if (draft.stage === 'what') return askWhat(db, chat, draft);
  if (draft.stage === 'since') return askSince(db, chat, draft);
  return askExtra(db, chat, draft);
}
