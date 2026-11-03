import type { Transaction } from '@oneohm/database';
import { asksForPerson, type OnboardAnswers, type OnboardingSettings } from '@oneohm/domain';
import { assistantLanguage, inLanguage } from '../assistant/language';
import type { Conversation } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { PERSON_CHOICE } from './onboarding-context';
import type { Fetched, PendingFile } from './onboarding-files';
import type { OpenLead } from './onboarding-lead';

/** One message being applied, inside the transaction that holds the chat row. */
export interface Turn {
  readonly tx: Transaction;
  readonly chat: Conversation;
  readonly settings: OnboardingSettings;
  readonly lead: OpenLead | null;
  readonly known: Partial<OnboardAnswers>;
  /** The photo or paper in this message, downloaded before the lock was taken. */
  readonly file: Fetched | null;
  /** Held-bill objects to remove once this transaction has committed. */
  readonly discard: string[];
  answers: OnboardAnswers;
  misses: number;
  awaiting: 'name' | 'city' | undefined;
  /** A bill sent before the lead existed, waiting in object storage. */
  pendingFile: PendingFile | undefined;
  /** The lead was made from the saved ad entry, so the chat forgets it. */
  dropEntry: boolean;
}

export const BACK = new Set(['back', 'change', 'मागे', 'परत', 'पीछे', 'वापस', 'बदला', 'बदलें']);
/** Taps that hand the chat to a person, including the old stranger buttons. */
const PERSON_TAPS = new Set([PERSON_CHOICE, 'human', 'callback']);
export const wantsPerson = (incoming: Incoming) =>
  (incoming.choiceId !== null && PERSON_TAPS.has(incoming.choiceId)) ||
  (incoming.kind === 'text' && asksForPerson(incoming.text));

/** Replies go out in the language chosen, from the moment it is chosen. */
export const speak = <T>(turn: Turn, say: () => Promise<T>): Promise<T> =>
  inLanguage(assistantLanguage(turn.answers.language ?? turn.chat.language), say);
