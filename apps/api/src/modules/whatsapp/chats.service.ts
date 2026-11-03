import { Inject, Injectable } from '@nestjs/common';
import type { ChatDetail, ChatSummary } from '@oneohm/api-contracts';
import {
  coveredBy,
  notify,
  outbox,
  roles,
  userRoles,
  users,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { followUpText } from '@oneohm/domain';
import { and, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { contactLeadsByPhone } from '../crm/lead-history';
import { chatOwnerFor, ensureChatOwner } from './chat-owner';
import {
  conversationForPhone,
  customerForPhone,
  keepEntry,
  queueReply,
  queueTemplate,
} from './chat-store';
import { chatSummaries } from './chat-summaries';
import { deliveryState } from './delivery-state';

/** "Sunita Jadhav (test)" → "Sunita"; a chat without a name is greeted as "there". */
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first && !first.startsWith('+') ? first : 'there';
}

/** The service and sales desks see every chat; everyone else sees the chats they answer. */
export const seesAllChats = (actor: Actor) =>
  can(actor, 'service.manage') || can(actor, 'customers.manage');

/**
 * The staff WhatsApp inbox: chats, their history and a way to answer by hand. Each chat
 * has an owner who answers it, so nobody needs a personal phone for customers.
 */
@Injectable()
export class ChatsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  async list(actor: Actor): Promise<ChatSummary[]> {
    if (seesAllChats(actor)) return this.summaries(undefined, 200);
    return this.summaries(this.mine(actor, await coveredBy(this.db, actor.userId)), 200);
  }

  async get(actor: Actor, id: string): Promise<ChatDetail> {
    const [chat] = await this.summaries(eq(waConversations.id, id), 1);
    if (!chat) throw notFound('That chat');
    if (!(await this.mayAnswer(actor, chat))) throw forbidden();
    const rows = await this.db
      .select({
        message: waMessages,
        status: outbox.status,
        deliveryStatus: outbox.deliveryStatus,
        sentBy: users.fullName,
      })
      .from(waMessages)
      .leftJoin(outbox, eq(outbox.id, waMessages.outboxId))
      .leftJoin(users, eq(users.id, waMessages.sentByUserId))
      .where(eq(waMessages.conversationId, id))
      .orderBy(desc(waMessages.createdAt))
      .limit(200); // the newest 200, shown oldest first
    return {
      chat,
      messages: rows.reverse().map(({ message, status, deliveryStatus, sentBy }) => ({
        id: message.id,
        direction: message.direction as 'in' | 'out',
        kind: message.kind,
        body: message.body,
        at: message.createdAt.toISOString(),
        delivery: status ? deliveryState({ status, deliveryStatus }) : null,
        sentBy,
      })),
    };
  }

  /**
   * A team member answers; the assistant stays quiet until released or "menu". Inside
   * WhatsApp's 24-hour window the words go as they are; after it, inside the approved
   * follow-up template, so the team never has to switch to a personal phone.
   */
  async reply(actor: Actor, id: string, text: string): Promise<ChatDetail> {
    const { chat } = await this.get(actor, id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(waConversations)
        .set({
          state: 'human',
          handedOverAt: sql`coalesce(${waConversations.handedOverAt}, now())`,
          handledByUserId: actor.userId,
          assignedUserId: sql`coalesce(${waConversations.assignedUserId}, ${actor.userId}::uuid)`,
          updatedAt: new Date(),
        })
        .where(eq(waConversations.id, id));
      if (chat.windowOpen) await queueReply(tx, chat, { kind: 'text', body: text }, actor.userId);
      else
        await queueTemplate(
          tx,
          chat,
          'chat_follow_up',
          {
            customer: firstName(chat.name),
            staff: firstName(actor.fullName),
            message: followUpText(text),
          },
          actor.userId,
        );
      await contactLeadsByPhone(tx, chat.phone, actor.userId);
    });
    return this.get(actor, id);
  }

  /**
   * The chat with this number, ready to write in; made when there is none yet. Opened
   * from a customer or lead page, so whoever owns that customer may open it.
   */
  async open(actor: Actor, phone: string): Promise<ChatSummary> {
    // Checked before anything is made, so a refused open leaves nothing behind.
    if (!seesAllChats(actor) && (await this.ownerOfPhone(phone)) !== actor.userId)
      throw forbidden();
    const found = await conversationForPhone(this.db, phone);
    const conversation = await ensureChatOwner(this.db, found, actor.userId);
    const [chat] = await this.summaries(eq(waConversations.id, conversation.id), 1);
    if (!chat) throw notFound('That chat');
    return chat;
  }

  /** Who answers this number: the stored owner of its chat, else who would own it. */
  private async ownerOfPhone(phone: string): Promise<string | null> {
    const [existing] = await this.db
      .select({ assigned: waConversations.assignedUserId })
      .from(waConversations)
      .where(eq(waConversations.phone, phone));
    if (existing?.assigned) return existing.assigned;
    const customer = await customerForPhone(this.db, phone);
    return chatOwnerFor(this.db, { customerId: customer?.id ?? null, phone });
  }

  /** The chat with this number (or customer), or null: a page looks without making one. */
  async byPhone(actor: Actor, phone: string, customerId?: string): Promise<ChatDetail | null> {
    const [own] = await this.db
      .select({ id: waConversations.id })
      .from(waConversations)
      .where(eq(waConversations.phone, phone));
    // A family member's number reaches the same customer: show their newest chat.
    const [family] =
      own || !customerId
        ? []
        : await this.db
            .select({ id: waConversations.id })
            .from(waConversations)
            .where(eq(waConversations.customerId, customerId))
            .orderBy(desc(waConversations.updatedAt))
            .limit(1);
    const found = own ?? family;
    if (!found) return null;
    // Someone else's chat: this person sees no chat here rather than an error.
    const [summary] = await this.summaries(eq(waConversations.id, found.id), 1);
    return summary && (await this.mayAnswer(actor, summary)) ? this.get(actor, found.id) : null;
  }

  /** Active staff (not partners or resellers) a chat can be passed to. */
  async team(): Promise<{ id: string; name: string }[]> {
    const rows = await this.db
      .selectDistinct({ id: users.id, name: users.fullName })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(users.status, 'active'), eq(roles.kind, 'staff'), isNull(roles.archivedAt)))
      .orderBy(users.fullName);
    return rows;
  }

  /** "Pass to…": the chat gets a new owner, who hears about it. */
  async assign(actor: Actor, id: string, userId: string): Promise<ChatSummary> {
    const { chat } = await this.get(actor, id);
    // Only active staff answer the business's chats, never a partner or reseller.
    if (!(await this.team()).some((person) => person.id === userId))
      throw notFound('That team member');
    await this.db.transaction(async (tx) => {
      await tx
        .update(waConversations)
        .set({ assignedUserId: userId, updatedAt: new Date() })
        .where(eq(waConversations.id, id));
      if (userId !== actor.userId)
        await notify(
          tx,
          { userId },
          {
            kind: 'whatsapp_passed',
            title: `${firstName(actor.fullName)} passed you a WhatsApp chat`,
            body: chat.name,
            subject: { type: 'chat', id },
            dedupeKey: `wa_pass:${id}:${userId}:${Date.now()}`,
          },
        );
    });
    const [summary] = await this.summaries(eq(waConversations.id, id), 1);
    if (!summary) throw notFound('That chat');
    return summary;
  }

  async release(actor: Actor, id: string): Promise<ChatDetail> {
    await this.get(actor, id);
    await this.db
      .update(waConversations)
      .set({
        state: 'menu',
        context: keepEntry({}),
        handedOverAt: null,
        handledByUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(waConversations.id, id));
    return this.get(actor, id);
  }

  /** Chats this person answers: their own, ones they replied in, and ones they cover today. */
  private mine(actor: Actor, covered: readonly string[]): SQL | undefined {
    return or(
      eq(waConversations.assignedUserId, actor.userId),
      eq(waConversations.handledByUserId, actor.userId),
      covered.length > 0 ? inArray(waConversations.assignedUserId, [...covered]) : undefined,
    );
  }

  private async mayAnswer(actor: Actor, chat: ChatSummary): Promise<boolean> {
    if (seesAllChats(actor)) return true;
    if (chat.assignee?.id === actor.userId || chat.handledByUserId === actor.userId) return true;
    // A leave backup answers the chats of the person they cover.
    return Boolean(
      chat.assignee && (await coveredBy(this.db, actor.userId)).includes(chat.assignee.id),
    );
  }

  private summaries(where: SQL | undefined, limit: number): Promise<ChatSummary[]> {
    return chatSummaries(this.db, this.env, where, limit);
  }
}
