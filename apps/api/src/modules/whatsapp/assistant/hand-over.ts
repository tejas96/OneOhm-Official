import { Inject, Injectable } from '@nestjs/common';
import {
  answererFor,
  notifyStaffHolders,
  readBusinessSetting,
  users,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { isWorkingTime, lastWorkEnd } from '@oneohm/domain';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { deskFor, ensureChatOwner, tellChatTeam } from '../chat-owner';
import { type Conversation, queueReply } from '../chat-store';
import { WORDS } from './words';

/**
 * Handing a WhatsApp chat to a person: the chat goes quiet for the assistant, its owner
 * (or the desk for its kind) is told, and the customer hears who will reply.
 */
@Injectable()
export class HandOverService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  /**
   * A person takes over; the assistant stays quiet until the customer types "menu".
   * `summary` (such as the onboarding answers so far) is added to the staff alert.
   */
  async handOver(
    chat: Conversation,
    capability: string,
    reply: string = WORDS.humanSoon,
    summary?: string,
  ) {
    await this.toPerson(chat);
    const owned = await ensureChatOwner(this.db, chat);
    const who = `${chat.profileName ?? 'A customer'} · ${chat.phone}`;
    const alert = {
      kind: 'whatsapp_handover',
      title: 'Someone wants to talk on WhatsApp',
      body: summary ? `${who}. ${summary}` : who,
      key: `wa_handover:${chat.id}:${Date.now()}`,
    };
    // The owner hears first; a chat nobody owns goes to the desk that handles this kind.
    if (owned.assignedUserId) await tellChatTeam(this.db, owned, alert);
    else
      await notifyStaffHolders(this.db, capability, {
        kind: alert.kind,
        title: alert.title,
        body: alert.body,
        subject: { type: 'chat', id: chat.id },
        dedupeKey: alert.key,
      });
    return queueReply(this.db, chat, { kind: 'text', body: reply });
  }

  /** To the chat's own person (or its desk), named in the reply; `summary` as in handOver. */
  async passToOwner(chat: Conversation, summary?: string) {
    const owned = await ensureChatOwner(this.db, chat);
    return this.handOver(
      owned,
      deskFor(owned),
      WORDS.passedToOwner(await this.answererName(owned)),
      summary,
    );
  }

  /** The chat is a person's now, without telling anyone (they asked for a call back). */
  toPerson(chat: Conversation) {
    return this.db
      .update(waConversations)
      .set({ state: 'human', handedOverAt: new Date(), updatedAt: new Date() })
      .where(eq(waConversations.id, chat.id));
  }

  /**
   * Outside working hours, a chat with a person gets one calm reply a night saying who
   * has the message (Settings → Reminders can turn it off). Runs in the customer's language.
   */
  async nightReply(chat: Conversation): Promise<void> {
    const now = new Date();
    const zone = this.env.BUSINESS_TIMEZONE;
    if (isWorkingTime(now, zone)) return;
    if (!(await readBusinessSetting(this.db, 'reminders')).whatsappNightReply) return;
    const [said] = await this.db
      .select({ id: waMessages.id })
      .from(waMessages)
      .where(
        and(
          eq(waMessages.conversationId, chat.id),
          eq(waMessages.direction, 'out'),
          isNull(waMessages.sentByUserId),
          gt(waMessages.createdAt, lastWorkEnd(now, zone)),
        ),
      )
      .limit(1);
    if (said) return;
    const name = await this.answererName(chat);
    await queueReply(this.db, chat, { kind: 'text', body: WORDS.nightReply(name) });
  }

  /** The first name of whoever answers this chat today, or null for the team. */
  private async answererName(chat: Conversation): Promise<string | null> {
    const userId = await answererFor(this.db, chat.assignedUserId ?? chat.handledByUserId);
    if (!userId) return null;
    const [user] = await this.db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    return user ? (user.name.split(/\s+/)[0] ?? user.name) : null;
  }
}
