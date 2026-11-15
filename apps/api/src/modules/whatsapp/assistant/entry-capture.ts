import {
  type DatabaseExecutor,
  type LeadAttribution,
  leadCampaigns,
  waConversations,
} from '@oneohm/database';
import { findCampaignCode, isReservedCampaignWord } from '@oneohm/domain';
import { eq, sql } from 'drizzle-orm';
import type { IntakeAttribution, LeadIntakeService } from '../../crm/lead-intake.service';
import type { Conversation } from '../chat-store';
import { isOnboardingChat } from '../onboarding/onboarding-context';
import type { Incoming } from '../whatsapp-events';
import { withAdLinks } from './entry-ads';
import { exactChoice, isHello, isMenuWord, smallTalkOf } from './known-words';

/** Where a message came from: the Meta ad it was sent from, and/or "Hi OneOhm <CODE>". */
export function entryOf(incoming: Incoming, known?: ReadonlySet<string>): LeadAttribution | null {
  const ad = incoming.referral;
  const code = incoming.kind === 'text' ? findCampaignCode(incoming.text, known) : null;
  if (!ad && !code) return null;
  return {
    ...(ad
      ? {
          adId: ad.sourceId,
          adHeadline: ad.headline,
          adSourceUrl: ad.sourceUrl,
          ...(ad.ctwaClid ? { ctwaClid: ad.ctwaClid } : {}),
        }
      : {}),
    ...(code ? { campaignCode: code } : {}),
  };
}

/** Every code on the Ad and campaign codes list, on or off, uppercase. */
async function listedCodes(db: DatabaseExecutor): Promise<Set<string>> {
  const rows = await db.select({ code: leadCampaigns.code }).from(leadCampaigns);
  return new Set(rows.map((row) => row.code));
}

const BARE_CODE = /^[A-Za-z0-9_-]{2,20}$/;

/**
 * A new person who types only a code on the Ad and campaign codes list ("Diwali26", any case)
 * sent the same thing as "Hi OneOhm DIWALI26": the message is read as that opener. Only a listed
 * code counts (a bare word is otherwise an answer or a greeting), never a known word of ours,
 * and never from a customer, a chat a person holds, or one answering an onboarding question.
 */
export async function asOpener(
  db: DatabaseExecutor,
  chat: Pick<Conversation, 'customerId' | 'state' | 'context'>,
  incoming: Incoming,
): Promise<Incoming> {
  if (incoming.kind !== 'text' || chat.customerId || chat.state === 'human') return incoming;
  const word = incoming.text.trim();
  if (!BARE_CODE.test(word) || isOnboardingChat(chat)) return incoming;
  if (isHello(word) || isMenuWord(word) || exactChoice(word) || smallTalkOf(word)) return incoming;
  const code = word.toUpperCase();
  if (isReservedCampaignWord(code) || !(await listedCodes(db)).has(code)) return incoming;
  return { ...incoming, text: `Hi OneOhm ${code}` };
}

/** What was remembered in the chat about where this person came from, if anything. */
export function savedEntry(chat: Pick<Conversation, 'context'>): IntakeAttribution | undefined {
  const entry = (chat.context as { entry?: IntakeAttribution } | null)?.entry;
  return entry ?? undefined;
}

/**
 * Remembers on the chat where a new person came from, so the lead made later (on call-back
 * or a friend's referral code) knows. First touch wins: once saved, it is never replaced.
 * Customers and numbers with an open lead are skipped (their lead already has its source).
 * Returns the chat as it now stands.
 */
export async function captureEntry(
  db: DatabaseExecutor,
  intake: LeadIntakeService,
  chat: Conversation,
  incoming: Incoming,
): Promise<Conversation> {
  if (chat.customerId || savedEntry(chat)) return chat;
  const read = entryOf(incoming, incoming.kind === 'text' ? await listedCodes(db) : undefined);
  if (!read) return chat;
  const entry = await withAdLinks(db, read, incoming);
  if (await intake.openLeadByPhone(db, chat.phone)) return chat;
  // Merged in the database, not from the copy read before the lock: two quick messages
  // never overwrite each other's keys (such as the onboarding answers), and the first wins.
  const [saved] = await db
    .update(waConversations)
    .set({
      context: sql`case when ${waConversations.context} ? 'entry' then ${waConversations.context}
        else coalesce(${waConversations.context}, '{}'::jsonb) || jsonb_build_object('entry', ${JSON.stringify(entry)}::jsonb) end`,
    })
    .where(eq(waConversations.id, chat.id))
    .returning({ context: waConversations.context });
  return { ...chat, context: saved?.context ?? chat.context };
}

/** Forgets the saved entry once a lead has been made from it. */
export async function clearEntry(db: DatabaseExecutor, chat: Conversation): Promise<void> {
  const { entry: _gone, ...rest } = chat.context as Record<string, unknown>;
  await db.update(waConversations).set({ context: rest }).where(eq(waConversations.id, chat.id));
}
