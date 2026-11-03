import { type DatabaseExecutor, type LeadAttribution, waConversations } from '@oneohm/database';
import { findCampaignCode } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { Conversation } from '../chat-store';
import type { Incoming } from '../whatsapp-events';

/** Where a message came from: the Meta ad it was sent from, and/or "Hi OneOhm <CODE>". */
export function entryOf(incoming: Incoming): LeadAttribution | null {
  const ad = incoming.referral;
  const code = incoming.kind === 'text' ? findCampaignCode(incoming.text) : null;
  if (!ad && !code) return null;
  return {
    ...(ad ? { adId: ad.sourceId, adHeadline: ad.headline, adSourceUrl: ad.sourceUrl } : {}),
    ...(code ? { campaignCode: code } : {}),
  };
}

/** What was remembered in the chat about where this person came from, if anything. */
export function savedEntry(chat: Pick<Conversation, 'context'>): LeadAttribution | undefined {
  const entry = (chat.context as { entry?: LeadAttribution } | null)?.entry;
  return entry ?? undefined;
}

/**
 * Remembers on the chat where a new person came from, so the lead made later (on call-back
 * or a friend's referral code) knows. First touch wins: once saved, it is never replaced,
 * and customers (who are not leads) are skipped. Returns the chat as it now stands.
 */
export async function captureEntry(
  db: DatabaseExecutor,
  chat: Conversation,
  incoming: Incoming,
): Promise<Conversation> {
  const entry = entryOf(incoming);
  if (!entry || chat.customerId || savedEntry(chat)) return chat;
  const context = { ...(chat.context as Record<string, unknown>), entry };
  await db.update(waConversations).set({ context }).where(eq(waConversations.id, chat.id));
  return { ...chat, context };
}

/** Forgets the saved entry once a lead has been made from it. */
export async function clearEntry(db: DatabaseExecutor, chat: Conversation): Promise<void> {
  const { entry: _gone, ...rest } = chat.context as Record<string, unknown>;
  await db.update(waConversations).set({ context: rest }).where(eq(waConversations.id, chat.id));
}
