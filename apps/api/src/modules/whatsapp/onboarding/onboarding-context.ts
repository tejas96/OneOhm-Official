import { type OnboardAnswers, type OnboardStep, STEP_ORDER } from '@oneohm/domain';
import type { Conversation } from '../chat-store';
import type { PendingFile } from './onboarding-files';

/**
 * What an onboarding chat remembers in `wa_conversations.context.ob`: the answers so far,
 * how many unclear answers in a row, and whether the bot waits for a typed name or city.
 * The chat state is `onboard:<step>`; a person's hand-over or a release keeps `ob`.
 */
export interface OnboardContext {
  readonly answers: OnboardAnswers;
  readonly misses: number;
  readonly awaiting?: 'name' | 'city';
  /** A bill sent before the lead existed; filed on the lead when it is made. */
  readonly pendingFile?: PendingFile;
  /** When the one "Shall we continue?" nudge was sent (never sent twice). */
  readonly nudgedAt?: string;
  /** When this onboarding began; a lead made since then counts even once closed. */
  readonly startedAt?: string;
  /** When the stalled-chat job made a lead or set its call-today; it never acts twice. */
  readonly followedUpAt?: string;
}

/** The tap that hands the chat to a person, offered on every question. */
export const PERSON_CHOICE = 'ob:person';
/** The nudge's "Continue" tap: the current question again. */
export const CONTINUE_CHOICE = 'ob:continue';

/** The taps under the estimate: a call today, or "Not now" and then when to check back. */
export const ESTIMATE_CHOICES = {
  call: 'ob:done:call',
  notNow: 'ob:done:notnow',
  later: 'ob:done:later:',
} as const;
export const LATER_PERIODS = ['1w', '1m', '3m'] as const;
export type LaterPeriod = (typeof LATER_PERIODS)[number];

const STATE_PREFIX = 'onboard:';

export const onboardState = (step: OnboardStep) => `${STATE_PREFIX}${step}`;

/** The step a chat state names, or null when the chat is not on an onboarding step. */
export function stepOfState(state: string): OnboardStep | null {
  if (!state.startsWith(STATE_PREFIX)) return null;
  const step = state.slice(STATE_PREFIX.length);
  return (STEP_ORDER as readonly string[]).includes(step) ? (step as OnboardStep) : null;
}

export function readOnboard(chat: Pick<Conversation, 'context'>): OnboardContext | null {
  const ob = (chat.context as { ob?: OnboardContext } | null)?.ob;
  return ob && typeof ob === 'object' ? ob : null;
}

/**
 * True for a chat the onboarding bot started: by its state, or by the kept answers after
 * a person handed it back (a release resets the state but keeps `ob`).
 */
export const isOnboardingChat = (chat: Pick<Conversation, 'state' | 'context'>) =>
  stepOfState(chat.state) !== null || readOnboard(chat) !== null;

/** The first question still open: neither answered in the chat nor known from the lead. */
export function firstMissing(answers: OnboardAnswers, known: Partial<OnboardAnswers>): OnboardStep {
  return (
    STEP_ORDER.find(
      (step) => step === 'done' || (answers[step] === undefined && known[step] === undefined),
    ) ?? 'done'
  );
}
