import type { Transaction } from '@oneohm/database';
import { isWorkingTime, type OnboardingSettings } from '@oneohm/domain';
import type { Conversation } from '../chat-store';
import { type OnboardContext, readOnboard } from './onboarding-context';
import type { OpenLead } from './onboarding-lead';
import type { Turn } from './onboarding-turn';

export const HOUR = 3_600_000;
/** A chat with no lead gets one after this many silent hours, even with nudges off. */
export const LEAD_AFTER_HOURS = 3;
/** The nudge is a session message, so it only goes inside WhatsApp's free 24 hours. */
export const WINDOW_HOURS = 24;
/** Chats silent longer than this are left alone, so a deploy never floods sales with old chats. */
export const GIVE_UP_HOURS = 7 * 24;
/** At most this many chats are handled per tick. */
export const PER_TICK = 200;

interface Due {
  readonly settings: OnboardingSettings;
  readonly silent: number;
  readonly now: Date;
  readonly zone: string;
  readonly kept: OnboardContext | null;
  /** An open lead exists. */
  readonly hasLead: boolean;
  /** A lead of any stage exists (a closed one still counts). */
  readonly hadLead: boolean;
}

/** What is due for a silent chat: a lead (none ever, not followed up) and/or the one nudge. */
export function due(input: Due): { makeLead: boolean; nudge: boolean } {
  const { settings, silent, kept } = input;
  const makeLead =
    !input.hadLead &&
    !kept?.followedUpAt &&
    silent >= Math.max(settings.nudgeAfterHours, LEAD_AFTER_HOURS) * HOUR;
  const nudge =
    settings.nudgeAfterHours > 0 &&
    !kept?.nudgedAt &&
    (makeLead || input.hasLead) &&
    silent >= settings.nudgeAfterHours * HOUR &&
    silent < WINDOW_HOURS * HOUR &&
    isWorkingTime(input.now, input.zone);
  return { makeLead, nudge };
}

/** The chat as a turn, so the lead-making helpers of the flow can be reused as they are. */
export function nudgeTurn(input: {
  readonly tx: Transaction;
  readonly chat: Conversation;
  readonly lead: OpenLead | null;
  readonly settings: OnboardingSettings;
  readonly discard: string[];
}): Turn {
  const kept = readOnboard(input.chat);
  return {
    ...input,
    known: {},
    file: null,
    answers: kept?.answers ?? {},
    misses: kept?.misses ?? 0,
    awaiting: kept?.awaiting,
    pendingFile: kept?.pendingFile,
    dropEntry: false,
  };
}
