import { Inject, Injectable } from '@nestjs/common';
import type { ChatDetail, ChatSummary } from '@oneohm/api-contracts';
import { customers, outbox, users, waConversations, waMessages } from '@oneohm/database';
import { desc, eq, sql } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { queueReply } from './chat-store';
import { deliveryState } from './delivery-state';

const WINDOW_MS = 24 * 3600 * 1000;

/** The staff WhatsApp inbox: every chat, its history and a way to answer by hand. */
@Injectable()
export class ChatsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<ChatSummary[]> {
    const rows = await this.db
      .select({ chat: waConversations, customer: customers.name })
      .from(waConversations)
      .leftJoin(customers, eq(customers.id, waConversations.customerId))
      .orderBy(desc(waConversations.updatedAt))
      .limit(200);
    const last = await this.db
      .selectDistinctOn([waMessages.conversationId], {
        conversationId: waMessages.conversationId,
        body: waMessages.body,
        direction: waMessages.direction,
        at: waMessages.createdAt,
      })
      .from(waMessages)
      .orderBy(waMessages.conversationId, desc(waMessages.createdAt));
    const lastBy = new Map(last.map((row) => [row.conversationId, row]));
    return rows.map(({ chat, customer }) => {
      const message = lastBy.get(chat.id);
      return {
        id: chat.id,
        phone: chat.phone,
        name: customer ?? chat.profileName ?? chat.phone,
        customerId: chat.customerId,
        state: chat.state,
        handedOverAt: chat.handedOverAt?.toISOString() ?? null,
        lastMessage: message
          ? {
              body: message.body,
              direction: message.direction as 'in' | 'out',
              at: message.at.toISOString(),
            }
          : null,
        lastInboundAt: chat.lastInboundAt?.toISOString() ?? null,
        windowOpen: chat.lastInboundAt
          ? Date.now() - chat.lastInboundAt.getTime() < WINDOW_MS
          : false,
      };
    });
  }

  async get(id: string): Promise<ChatDetail> {
    const chat = (await this.list()).find((item) => item.id === id);
    if (!chat) throw notFound('That chat');
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
      .orderBy(waMessages.createdAt)
      .limit(500);
    return {
      chat,
      messages: rows.map(({ message, status, deliveryStatus, sentBy }) => ({
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

  /** A team member answers; the assistant stays quiet until released or "menu". */
  async reply(actor: Actor, id: string, text: string): Promise<ChatDetail> {
    const { chat } = await this.get(id);
    if (!chat.windowOpen)
      throw conflict(
        "WhatsApp allows free replies only within 24 hours of the customer's last message. Call them, or wait for them to write.",
        'window_closed',
      );
    await this.db.transaction(async (tx) => {
      await tx
        .update(waConversations)
        .set({
          state: 'human',
          handedOverAt: sql`coalesce(${waConversations.handedOverAt}, now())`,
          handledByUserId: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(waConversations.id, id));
      await queueReply(tx, chat, { kind: 'text', body: text }, actor.userId);
    });
    return this.get(id);
  }

  async release(id: string): Promise<ChatDetail> {
    await this.db
      .update(waConversations)
      .set({
        state: 'menu',
        context: {},
        handedOverAt: null,
        handledByUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(waConversations.id, id));
    return this.get(id);
  }
}
