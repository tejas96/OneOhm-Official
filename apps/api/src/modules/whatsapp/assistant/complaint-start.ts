import type { DatabaseExecutor } from '@oneohm/database';
import { activeHomes } from '../../customer-portal/active-projects';
import { type Conversation, queueReply } from '../chat-store';
import { setStep } from './chat-step';
import { sayWithTaps } from './closing-taps';
import { keepPending } from './media-intake';
import { PROJECT_WORDS } from './project-words';
import { WORDS } from './words';

/** A list keeps 10 rows. */
const HOME_ROWS = 10;
const HOME_TAP = /^home:([0-9a-f-]{36})$/;

/** The project a which-home row was tapped for, or null for any other tap. */
export const homeTapped = (choiceId: string | null) => HOME_TAP.exec(choiceId ?? '')?.[1] ?? null;

/**
 * "Report a problem": a customer with 2 or more active homes first picks which one, as a
 * list of towns (menu audit M10); with one, the bot asks for the words at once. Photos
 * sent before are kept for the request.
 */
export async function startComplaint(
  db: DatabaseExecutor,
  chat: Conversation,
  customerId: string,
): Promise<void> {
  const homes = await activeHomes(db, customerId);
  if (homes.length < 2) return askProblem(db, chat, homes[0]?.id);
  await setStep(db, chat, 'await_home', keepPending(chat.context));
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
 * A home picked from the list: the complaint is filed on it. One no longer active is said
 * so (review F4), then the list again, or the question at once when one home is left.
 */
export async function pickHome(
  db: DatabaseExecutor,
  chat: Conversation,
  customerId: string,
  projectId: string,
): Promise<void> {
  const homes = await activeHomes(db, customerId);
  if (!homes.some((home) => home.id === projectId)) {
    await queueReply(db, chat, { kind: 'text', body: PROJECT_WORDS.homeGone });
    return startComplaint(db, chat, customerId);
  }
  return askProblem(db, chat, projectId);
}

/** "Tell us the problem", with Menu to leave (menu audit M1). */
async function askProblem(db: DatabaseExecutor, chat: Conversation, projectId?: string) {
  const context = { ...keepPending(chat.context), ...(projectId ? { projectId } : {}) };
  await setStep(db, chat, 'await_problem', context);
  return sayWithTaps(db, chat, WORDS.askProblem, ['menu']);
}
