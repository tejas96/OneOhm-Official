import { Inject, Injectable } from '@nestjs/common';
import {
  answererFor,
  type DatabaseExecutor,
  notifyStaffHolders,
  readBusinessSetting,
  users,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { isWorkingTime, lastWorkEnd } from '@oneohm/domain';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { deskFor, ensureChatOwner, tellChatTeam } from '../chat-owner';
import { type Conversation, queueReply } from '../chat-store';
import { sayWithTaps } from './closing-taps';
import { WORDS } from './words';

/**
 * One "asked for a person" alert per customer message: keyed by the message that asked,
 * so Meta's retry after a later failure does not alert again. A clock key only when the
 * chat has no message from the customer yet.
 */
async function handOverKey(db: DatabaseExecutor, chatId: string): Promise<string> {
  const [asked] = await db
    .select({ id: waMessages.waMessageId })
    .from(waMessages)
    .where(and(eq(waMessages.conversationId, chatId), eq(waMessages.direction, 'in')))
    .orderBy(desc(waMessages.createdAt))
    .limit(1);
  return `wa_handover:${chatId}:${asked?.id ?? Date.now()}`;
}

export interface HandOverOptions {
  /** Added to the staff alert, such as the onboarding answers so far. */
  readonly summary?: string | undefined;
  /** The caller's transaction; the hand-over then commits with the caller's work. */
  readonly db?: DatabaseExecutor | undefined;
  /** What the customer hears instead of "<name> will reply to you here". */
  readonly reply?: string | undefined;
}

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
   * A person takes over; the assistant stays quiet until the customer taps Menu.
   * `summary` (such as the onboarding answers so far) is added to the staff alert; pass
   * `db` (a transaction) so the state, the alert and the reply commit together.
   */
  async handOver(
    chat: Conversation,
    capability: string,
    reply?: string,
    { summary, db = this.db }: HandOverOptions = {},
  ) {
    await this.toPerson(chat, db);
    const owned = await ensureChatOwner(db, chat);
    const who = `${chat.profileName ?? 'A customer'} · ${chat.phone}`;
    const alert = {
      kind: 'whatsapp_handover',
      title: 'Someone wants to talk on WhatsApp',
      body: summary ? `${who}. ${summary}` : who,
      key: await handOverKey(db, chat.id),
    };
    // The owner hears first; a chat nobody owns goes to the desk that handles this kind.
    if (owned.assignedUserId) await tellChatTeam(db, owned, alert);
    else
      await notifyStaffHolders(db, capability, {
        kind: alert.kind,
        title: alert.title,
        body: alert.body,
        subject: { type: 'chat', id: chat.id },
        dedupeKey: alert.key,
      });
    // Every hand-over reply keeps a Menu tap to go back to the assistant (menu audit M2).
    return sayWithTaps(db, chat, reply ?? WORDS.humanSoon, ['menu']);
  }

  /**
   * A location pin, a contact card or a sticker: the chat shows it and its person (or the
   * desk) is told once. The chat stays with the assistant and nothing is said back. A
   * `quiet` one (a reaction) is only shown in the chat.
   */
  async tellSent(chat: Conversation, waMessageId: string, sent: string, quiet = false) {
    if (quiet) return;
    const owned = await ensureChatOwner(this.db, chat);
    await tellChatTeam(this.db, owned, {
      kind: 'whatsapp_message',
      title: `WhatsApp from ${chat.profileName ?? chat.phone}`,
      body: sent.slice(0, 140),
      key: `wa_in:${waMessageId}`,
    });
  }

  /** To the chat's own person (or its desk), named in the reply; options as in handOver. */
  async passToOwner(chat: Conversation, options: HandOverOptions = {}) {
    const db = options.db ?? this.db;
    const owned = await ensureChatOwner(db, chat);
    return this.handOver(
      owned,
      deskFor(owned),
      options.reply ?? WORDS.passedToOwner(await this.answererName(owned, db)),
      options,
    );
  }

  /**
   * The chat is a person's now, without telling anyone (they asked for a call back). A bot
   * step left waiting ends, so the next words are the person's, not a complaint.
   */
  toPerson(chat: Conversation, db: DatabaseExecutor = this.db) {
    return db
      .update(waConversations)
      .set({
        state: 'human',
        context: sql`${waConversations.context} - 'step'`,
        handedOverAt: new Date(),
        updatedAt: new Date(),
      })
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
          ne(waMessages.kind, 'note'),
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
  async answererName(chat: Conversation, db: DatabaseExecutor = this.db): Promise<string | null> {
    const userId = await answererFor(db, chat.assignedUserId ?? chat.handledByUserId);
    if (!userId) return null;
    const [user] = await db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    return user ? (user.name.split(/\s+/)[0] ?? user.name) : null;
  }
}
