import { waConversations } from '@oneohm/database';
import { eq, sql } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { invalid } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import { lockedChat } from './chat-store';
import {
  chooseSocialTarget,
  queueSocialReply,
  SOCIAL_NAME,
  type SocialChannel,
  type SocialWindows,
  socialHandle,
} from './social-reply';

/** The refusal when neither a message nor a comment can be answered any more. */
export const socialWindowClosed = (channel: SocialChannel) =>
  invalid(
    `${SOCIAL_NAME[channel]} lets you answer only within 24 hours of their last message, or once to a comment within 7 days.`,
  );

/**
 * A team member answers an Instagram or Facebook chat: as a message when the person wrote in
 * the last 24 hours; else as a private reply to their newest comment of the last 7 days that
 * has none yet; else it is refused. Never a WhatsApp template, and never a call-back note on
 * a lead.
 */
export async function replyInSocialChat(
  db: Database,
  actor: Actor,
  chat: { id: string; phone: string; channel: SocialChannel; lastInboundAt: string | null },
  text: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const locked = await lockedChat(tx, chat.id);
    const target = chooseSocialTarget(
      (locked.context ?? {}) as SocialWindows,
      socialHandle(chat.phone)?.id ?? null,
      chat.lastInboundAt,
    );
    if (!target) throw socialWindowClosed(chat.channel);
    await tx
      .update(waConversations)
      .set({
        state: 'human',
        handedOverAt: sql`coalesce(${waConversations.handedOverAt}, now())`,
        handledByUserId: actor.userId,
        assignedUserId: sql`coalesce(${waConversations.assignedUserId}, ${actor.userId}::uuid)`,
        updatedAt: new Date(),
      })
      .where(eq(waConversations.id, chat.id));
    await queueSocialReply(tx, chat, text, target, actor.userId);
  });
}
