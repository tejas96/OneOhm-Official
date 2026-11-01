import type { CustomerAlert, CustomerChat, CustomerOutbound } from '@oneohm/api-contracts';
import {
  type Database,
  notifications,
  outbox,
  users,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { and, desc, eq, inArray, notLike, or, sql } from 'drizzle-orm';
import { deliveryState } from '../whatsapp/delivery-state';

/** Enough to read the thread; the inbox has the rest. */
const CHAT_MESSAGES = 60;
const LIST_LIMIT = 50;

/** The WhatsApp chat for the customer's phone, latest messages oldest first. */
export async function customerChat(db: Database, phone: string): Promise<CustomerChat | null> {
  const [chat] = await db
    .select()
    .from(waConversations)
    .where(eq(waConversations.phone, phone))
    .limit(1);
  if (!chat) return null;
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(waMessages)
    .where(eq(waMessages.conversationId, chat.id));
  const rows = await db
    .select({
      message: waMessages,
      status: outbox.status,
      deliveryStatus: outbox.deliveryStatus,
      sentBy: users.fullName,
    })
    .from(waMessages)
    .leftJoin(outbox, eq(outbox.id, waMessages.outboxId))
    .leftJoin(users, eq(users.id, waMessages.sentByUserId))
    .where(eq(waMessages.conversationId, chat.id))
    .orderBy(desc(waMessages.createdAt))
    .limit(CHAT_MESSAGES);
  return {
    id: chat.id,
    state: chat.state,
    lastInboundAt: chat.lastInboundAt?.toISOString() ?? null,
    messageCount: count?.total ?? rows.length,
    messages: rows.reverse().map(({ message, status, deliveryStatus, sentBy }) => ({
      id: message.id,
      direction: message.direction === 'in' ? 'in' : 'out',
      kind: message.kind,
      body: message.body,
      at: message.createdAt.toISOString(),
      delivery: status ? deliveryState({ status, deliveryStatus }) : null,
      sentBy,
    })),
  };
}

/**
 * Business messages sent to the customer: WhatsApp and SMS to their phone (chat replies
 * are in the chat, so they are left out) and push alerts, whose recipient is the alert.
 */
export async function customerOutbound(
  db: Database,
  customerId: string,
  phone: string,
): Promise<CustomerOutbound[]> {
  const theirAlerts = db
    .select({ id: sql`${notifications.id}::text` })
    .from(notifications)
    .where(eq(notifications.customerId, customerId));
  const rows = await db
    .select({ row: outbox, title: notifications.title })
    .from(outbox)
    .leftJoin(
      notifications,
      and(eq(outbox.channel, 'push'), sql`${outbox.recipient} = ${notifications.id}::text`),
    )
    .where(
      or(
        and(eq(outbox.recipient, phone), notLike(outbox.template, 'session:%')),
        and(eq(outbox.channel, 'push'), inArray(outbox.recipient, theirAlerts)),
      ),
    )
    .orderBy(desc(outbox.createdAt))
    .limit(LIST_LIMIT);
  return rows.map(({ row, title }) => ({
    id: row.id,
    channel: row.channel,
    template: row.template,
    title,
    state: deliveryState(row),
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The customer app's inbox, newest first. */
export async function customerAlerts(db: Database, customerId: string): Promise<CustomerAlert[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.customerId, customerId))
    .orderBy(desc(notifications.createdAt))
    .limit(LIST_LIMIT);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  }));
}
