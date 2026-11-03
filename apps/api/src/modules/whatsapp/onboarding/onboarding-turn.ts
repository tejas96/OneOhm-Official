import { type Transaction, waConversations } from '@oneohm/database';
import {
  asksForPerson,
  type OnboardAnswers,
  type OnboardingSettings,
  type OnboardStep,
  previousStep,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { assistantLanguage, inLanguage } from '../assistant/language';
import type { Conversation } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { changesName } from './onboarding-answer';
import { onboardState, PERSON_CHOICE, readOnboard } from './onboarding-context';
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

/**
 * The Back row of this question (C14), or "back" typed; at the name question "change"
 * (बदला, बदलें…) means a new name, not the step before.
 */
export const goesBack = (step: OnboardStep, choiceId: string | null, word: string) =>
  choiceId === `ob:${step}:back` ||
  (!choiceId && BACK.has(word) && !(step === 'name' && changesName(word)));
/** Taps that hand the chat to a person, including the old stranger buttons. */
const PERSON_TAPS = new Set([PERSON_CHOICE, 'human', 'callback']);
export const wantsPerson = (incoming: Incoming) =>
  (incoming.choiceId !== null && PERSON_TAPS.has(incoming.choiceId)) ||
  (incoming.kind === 'text' && asksForPerson(incoming.text));

/** Replies go out in the language chosen, from the moment it is chosen. */
export const speak = <T>(turn: Turn, say: () => Promise<T>): Promise<T> =>
  inLanguage(assistantLanguage(turn.answers.language ?? turn.chat.language), say);

/** Keeps the turn in the chat: its state is now `step`, and `ob` holds the answers so far. */
export async function saveTurn(turn: Turn, step: OnboardStep): Promise<void> {
  const { entry, ...rest } = turn.chat.context as Record<string, unknown>;
  const { nudgedAt, followedUpAt, startedAt } = readOnboard(turn.chat) ?? {};
  const ob = {
    answers: turn.answers,
    startedAt: startedAt ?? new Date().toISOString(),
    // The one nudge is never sent twice, even after the customer comes back and stalls again.
    ...(nudgedAt ? { nudgedAt } : {}),
    ...(followedUpAt ? { followedUpAt } : {}),
    misses: turn.misses,
    ...(turn.awaiting ? { awaiting: turn.awaiting } : {}),
    ...(turn.pendingFile ? { pendingFile: turn.pendingFile } : {}),
  };
  const context = { ...rest, ...(turn.dropEntry || entry === undefined ? {} : { entry }), ob };
  await turn.tx
    .update(waConversations)
    .set({ state: onboardState(step), context, updatedAt: new Date() })
    .where(eq(waConversations.id, turn.chat.id));
}

/**
 * Where Back goes, and the typed-answer wait is over: the step before, except that Back
 * from typing a city (after "Other city") is the city list again (fix round 1).
 */
export function backTo(turn: Turn, step: OnboardStep): OnboardStep {
  const typingCity = step === 'city' && turn.awaiting === 'city';
  turn.awaiting = undefined;
  return typingCity && turn.settings.serviceCities.length > 0 ? 'city' : previousStep(step);
}
