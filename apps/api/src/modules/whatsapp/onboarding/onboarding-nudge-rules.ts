import { leads, type Transaction } from '@oneohm/database';
import {
  CHAT_WINDOW_HOURS,
  isWorkingTime,
  MAX_NUDGE_AFTER_HOURS,
  type OnboardingSettings,
} from '@oneohm/domain';
import { and, eq, gte, notInArray, or } from 'drizzle-orm';
import type { Conversation } from '../chat-store';
import { type OnboardContext, readOnboard } from './onboarding-context';
import type { OpenLead } from './onboarding-lead';
import type { Turn } from './onboarding-turn';

export const HOUR = 3_600_000;
/** A chat with no lead gets one after this many silent hours, even with nudges off. */
export const LEAD_AFTER_HOURS = 3;
/**
 * How long a chat with no lead waits for one: the nudge wait, but at least 3 hours and at
 * most 23, so it always comes well before the job gives the chat up.
 */
export const leadAfterHours = (settings: OnboardingSettings): number =>
  Math.min(Math.max(settings.nudgeAfterHours, LEAD_AFTER_HOURS), MAX_NUDGE_AFTER_HOURS);

/** The nudge is a session message, so it only goes inside WhatsApp's chat window. */
export const WINDOW_HOURS = CHAT_WINDOW_HOURS;
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
  /** An open lead, or one of any stage made since this onboarding began (a closed one counts). */
  readonly hadLead: boolean;
}

/**
 * What is due for a silent chat: a lead (none ever, not followed up) and/or the one nudge.
 * Being followed up only stops a second lead: a chat whose lead was made at night still
 * gets its nudge next morning, if it has an open lead and was never nudged.
 */
export function due(input: Due): { makeLead: boolean; nudge: boolean } {
  const { settings, silent, kept } = input;
  const makeLead =
    !input.hadLead && !kept?.followedUpAt && silent >= leadAfterHours(settings) * HOUR;
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

/**
 * True when this number has an open lead, or one of any stage made since this onboarding
 * began (sales closing it does not bring it back). An older closed lead does not count, so
 * a lost number that starts again gets a new lead. Chats with no start time: open only.
 */
export async function leadOfThisOnboarding(
  tx: Transaction,
  phone: string,
  startedAt: string | undefined,
): Promise<boolean> {
  const open = notInArray(leads.stage, ['won', 'lost']);
  const [found] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        eq(leads.phoneE164, phone),
        startedAt ? or(open, gte(leads.createdAt, new Date(startedAt))) : open,
      ),
    )
    .limit(1);
  return found !== undefined;
}
