import {
  brandName,
  type DatabaseExecutor,
  notifyStaffHolders,
  waConversations,
} from '@oneohm/database';
import type { MetaTools } from '@oneohm/marketing';
import { eq } from 'drizzle-orm';
import { type LeadIntakeService, NoLeadTaker } from '../crm/lead-intake.service';
import { tellChatTeam } from '../whatsapp/chat-owner';
import { type Conversation, lockedChat } from '../whatsapp/chat-store';
import {
  COMMENT_WINDOW_MS,
  DM_WINDOW_MS,
  laterDm,
  queueSocialReply,
  SOCIAL_NAME,
  type SocialTarget,
  socialPhone,
  withComment,
} from '../whatsapp/social-reply';
import {
  type AdCampaign,
  campaignOfCode,
  campaignOfMetaAd,
  cityInMessage,
  settingsCity,
} from './ad-lookup';
import { leadCity } from './lead-mapping';
import { logSocial, remember, type SocialEvent, socialChatFor, socialLine } from './social-chat';
import { makeSocialLead } from './social-lead';
import { askText, type SocialContext, socialPlan, THANKS_TEXT } from './social-steps';

/**
 * What is looked up outside the database before the work starts: the person's profile name
 * (a call to Meta, only for a person with no chat yet and no name in the event). A failed
 * lookup, or no way to ask Meta, just leaves the name empty.
 */
export async function prepareSocial(
  db: DatabaseExecutor,
  getTools: () => Promise<Pick<MetaTools, 'profileName'> | null>,
  event: SocialEvent,
): Promise<{ profileName: string | null }> {
  if (event.kind === 'comment' && event.senderName) return { profileName: event.senderName };
  const [existing] = await db
    .select({ id: waConversations.id })
    .from(waConversations)
    .where(eq(waConversations.phone, socialPhone(event.channel, event.senderId)))
    .limit(1);
  const tools = existing ? null : await getTools().catch(() => null);
  if (!tools) return { profileName: null };
  const name = await tools.profileName(event.channel, event.senderId).catch(() => null);
  return { profileName: name ?? null };
}

/** True while Instagram or Facebook still lets us answer this event for the first time. */
export function canAnswerAutomatically(event: SocialEvent, now: Date = new Date()): boolean {
  const limit = event.kind === 'comment' ? COMMENT_WINDOW_MS : DM_WINDOW_MS;
  return now.getTime() - event.at.getTime() <= limit;
}

/**
 * A message or comment on Instagram or Facebook: saved in the chat (made on first contact,
 * answered by people, never the assistant), the chat's people told, and the person asked once
 * for a WhatsApp number and city. A mobile number in what they write makes the lead. All of
 * it runs in the caller's transaction (no call to Meta in here); the first automatic reply is
 * skipped once the platform no longer allows it.
 */
export async function handleSocialEvent(
  tx: DatabaseExecutor,
  intake: Pick<LeadIntakeService, 'receive'>,
  prepared: { profileName: string | null },
  event: SocialEvent,
): Promise<void> {
  const ad = event.kind === 'message' && event.adId ? event.adId : null;
  const campaign = ad ? await campaignOfMetaAd(tx, ad) : null;
  const fallbackCity = await settingsCity(tx);
  const facts = async () => ({
    profileName: prepared.profileName,
    city: leadCity(null, campaign, fallbackCity),
  });
  const adEntry =
    ad && event.kind === 'message'
      ? {
          adId: ad,
          adHeadline: campaign?.adName ?? event.adTitle,
          ...(campaign ? { campaignCode: campaign.code } : {}),
        }
      : null;
  const { chat: made } = await socialChatFor(tx, event, facts);
  if (!(await logSocial(tx, made.id, event))) return;
  const chat = await lockedChat(tx, made.id);
  const before = (chat.context ?? {}) as SocialContext;
  const patch =
    event.kind === 'comment'
      ? { lastCommentId: event.commentId, comments: withComment(before, event.commentId, event.at) }
      : { messaged: true, lastDmAt: laterDm(before, event.at) };
  await remember(tx, chat.id, patch, adEntry);
  const context: SocialContext = {
    ...before,
    ...patch,
    entry: before.entry ?? adEntry ?? undefined,
  };
  const line = socialLine(event);
  const platform = SOCIAL_NAME[event.channel];
  await tellChatTeam(tx, chat, {
    kind: 'social_message',
    title: `${platform} ${event.kind} from ${chat.profileName ?? 'a new contact'}`,
    body: (event.text || 'Sent a photo').slice(0, 140),
    key: `social_in:${line.id}`,
  });
  await answerSocial(tx, intake, { chat, context, event, campaign, fallbackCity, line });
}

interface Saved {
  readonly chat: Conversation;
  readonly context: SocialContext;
  readonly event: SocialEvent;
  readonly campaign: AdCampaign | null;
  readonly fallbackCity: string;
  readonly line: { id: string };
}

/** The step after a message is saved: make the lead from a number, or ask for one, once. */
async function answerSocial(
  tx: DatabaseExecutor,
  intake: Pick<LeadIntakeService, 'receive'>,
  { chat, context, event, campaign, fallbackCity, line }: Saved,
): Promise<void> {
  const platform = SOCIAL_NAME[event.channel];
  const target: SocialTarget =
    event.kind === 'comment'
      ? { recipientId: null, commentId: event.commentId }
      : { recipientId: event.senderId, commentId: null };
  const mayReply = canAnswerAutomatically(event);
  const plan = socialPlan(context, event.text);
  if (plan.makeLead && plan.phone) {
    const place = context.entry?.campaignCode
      ? await campaignOfCode(tx, context.entry.campaignCode)
      : campaign;
    const city = leadCity(await cityInMessage(tx, event.text), place, fallbackCity);
    try {
      await makeSocialLead(tx, intake, chat, context, event.text, plan.phone, city);
    } catch (error) {
      if (!(error instanceof NoLeadTaker)) throw error;
      // The message stays in the inbox; the desk is told once why there is no lead.
      await notifyStaffHolders(tx, 'leads.manage', {
        kind: 'lead_unassigned',
        title: 'A lead came in but nobody can take leads',
        body: `${chat.profileName ?? `A ${platform} contact`} gave a number on ${platform}, but no staff role has the leads permission. Give one the permission, then add the lead.`,
        subject: { type: 'chat', id: chat.id },
        dedupeKey: `social_no_taker:${line.id}`,
      });
      return;
    }
    if (mayReply)
      await queueSocialReply(tx, chat, THANKS_TEXT, target, null, `social:thanks:${chat.id}`);
  } else if (plan.ask && mayReply) {
    await remember(tx, chat.id, { askedNumber: true });
    await queueSocialReply(
      tx,
      chat,
      askText(chat.profileName, await brandName(tx)),
      target,
      null,
      `social:ask:${chat.id}`,
    );
  }
}
