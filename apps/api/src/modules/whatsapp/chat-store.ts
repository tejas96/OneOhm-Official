import { randomUUID } from 'node:crypto';
import {
  customerContacts,
  customers,
  type DatabaseExecutor,
  outbox,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { DEFAULT_MESSAGE_TEMPLATES, renderTemplate, soleCustomer } from '@oneohm/domain';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { type ChatReply, chatReplySummary } from './chat-reply';
import type { Incoming } from './whatsapp-events';

export type { ChatReply } from './chat-reply';

export type Conversation = typeof waConversations.$inferSelect;

/**
 * The customer behind a number: their own phone, else a family member they added (who
 * reaches the same chat and the same person). Null for a stranger.
 */
export async function customerForPhone(
  db: DatabaseExecutor,
  phone: string,
): Promise<{ readonly id: string; readonly name: string } | null> {
  const [own] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.phoneE164, phone))
    .limit(1);
  if (own) return own;
  const family = await db
    .select({ id: customers.id, name: customers.name })
    .from(customerContacts)
    .innerJoin(customers, eq(customers.id, customerContacts.customerId))
    .where(and(eq(customerContacts.phoneE164, phone), isNull(customerContacts.revokedAt)))
    .limit(2);
  return soleCustomer(family);
}

/** The chat for this number, made on first contact and linked to the customer who owns it. */
export async function conversationFor(
  db: DatabaseExecutor,
  incoming: Incoming,
): Promise<Conversation> {
  const owner = await customerForPhone(db, incoming.from);
  const values = { customerId: owner?.id ?? null, profileName: incoming.profileName };
  // Meta can deliver an older message late: the chat keeps its newest time.
  const lastInboundAt = sql`greatest(${waConversations.lastInboundAt}, excluded.last_inbound_at)`;
  const [row] = await db
    .insert(waConversations)
    .values({ phone: incoming.from, ...values, lastInboundAt: incoming.at })
    .onConflictDoUpdate({
      target: waConversations.phone,
      set: { ...values, lastInboundAt, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error('Conversation upsert returned nothing.');
  return row;
}

/** Saves an incoming message; false when WhatsApp delivered the same one again. */
export async function logIncoming(
  db: DatabaseExecutor,
  conversationId: string,
  incoming: Incoming,
): Promise<boolean> {
  const saved = await db
    .insert(waMessages)
    .values({
      conversationId,
      direction: 'in',
      waMessageId: incoming.waMessageId,
      kind: incoming.kind,
      body: incoming.text || `(${incoming.kind})`,
      mediaId: incoming.media?.id ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: waMessages.id });
  return saved.length > 0;
}

/** The chat message that carried this WhatsApp file now shows the stored document. */
export async function linkChatFile(
  db: DatabaseExecutor,
  mediaId: string | undefined,
  documentId: string,
): Promise<void> {
  if (!mediaId) return;
  await db.update(waMessages).set({ documentId }).where(eq(waMessages.mediaId, mediaId));
}

/** The document a WhatsApp file was stored as when it arrived; null when it was not kept. */
export async function chatDocumentFor(
  db: DatabaseExecutor,
  mediaId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ documentId: waMessages.documentId })
    .from(waMessages)
    .where(and(eq(waMessages.mediaId, mediaId), isNotNull(waMessages.documentId)))
    .limit(1);
  return row?.documentId ?? null;
}

/**
 * Queues a reply for the worker and keeps it in the chat history. With a `dedupeKey` the
 * same reply is queued once; asking again changes nothing.
 */
export async function queueReply(
  db: DatabaseExecutor,
  conversation: Pick<Conversation, 'id' | 'phone'>,
  reply: ChatReply,
  sentByUserId: string | null = null,
  dedupeKey?: string,
): Promise<void> {
  const [row] = await db
    .insert(outbox)
    .values({
      channel: 'whatsapp',
      recipient: conversation.phone,
      template: `session:${reply.kind}`,
      payload: reply,
      dedupeKey: dedupeKey ?? `chat:${randomUUID()}`,
      // The clock, not the transaction's start: replies queued together go out in order.
      createdAt: sql`clock_timestamp()`,
    })
    .onConflictDoNothing()
    .returning({ id: outbox.id });
  if (!row && dedupeKey) return;
  await db.insert(waMessages).values({
    conversationId: conversation.id,
    direction: 'out',
    kind: reply.kind,
    body: chatReplySummary(reply),
    outboxId: row?.id ?? null,
    sentByUserId,
  });
}

/**
 * Queues an approved template into a chat (used once the 24-hour window has closed) and
 * keeps its words in the history, so the team sees exactly what the customer got.
 */
export async function queueTemplate(
  db: DatabaseExecutor,
  conversation: Pick<Conversation, 'id' | 'phone'>,
  key: string,
  payload: Readonly<Record<string, string>>,
  sentByUserId: string | null = null,
): Promise<void> {
  const template = DEFAULT_MESSAGE_TEMPLATES.find((item) => item.key === key);
  if (!template) throw new Error(`No message template "${key}".`);
  const [row] = await db
    .insert(outbox)
    .values({
      channel: 'whatsapp',
      recipient: conversation.phone,
      template: key,
      payload,
      dedupeKey: `chat:${randomUUID()}`,
    })
    .returning({ id: outbox.id });
  await db.insert(waMessages).values({
    conversationId: conversation.id,
    direction: 'out',
    kind: 'template',
    body: renderTemplate(template.preview, template.fields, payload),
    outboxId: row?.id ?? null,
    sentByUserId,
  });
}

/** The chat for a number the team wants to write to; made when it does not exist yet. */
export async function conversationForPhone(
  db: DatabaseExecutor,
  phone: string,
): Promise<Conversation> {
  const [existing] = await db
    .select()
    .from(waConversations)
    .where(eq(waConversations.phone, phone))
    .limit(1);
  if (existing) return existing;
  const owner = await customerForPhone(db, phone);
  const [row] = await db
    .insert(waConversations)
    .values({ phone, customerId: owner?.id ?? null, profileName: owner?.name ?? null })
    .onConflictDoNothing({ target: waConversations.phone })
    .returning();
  if (row) return row;
  const [again] = await db
    .select()
    .from(waConversations)
    .where(eq(waConversations.phone, phone))
    .limit(1);
  if (!again) throw new Error('Conversation upsert returned nothing.');
  return again;
}

/**
 * The new context, still carrying the lead `entry`, onboarding `ob`, the files waiting on
 * "Which paper?" (`paperWait`) and the 30-minute home and paper answers (`fileHome`,
 * `filePaper`; each checks its own time) unless it sets them. A Menu tap keeps them all.
 */
export const keepEntry = (context: Record<string, unknown>) => {
  const kept = ['entry', 'ob', 'paperWait', 'fileHome', 'filePaper'].filter(
    (key) => context[key] === undefined,
  );
  if (kept.length === 0) return context;
  return sql`${JSON.stringify(context)}::jsonb || coalesce((SELECT jsonb_object_agg(key, value) FROM jsonb_each(${waConversations.context}) WHERE key = ANY(${`{${kept.join(',')}}`}::text[])), '{}'::jsonb)`;
};

/** The chat row, locked until the transaction ends, so two messages take turns. */
export async function lockedChat(tx: DatabaseExecutor, id: string): Promise<Conversation> {
  const [chat] = await tx
    .select()
    .from(waConversations)
    .where(eq(waConversations.id, id))
    .for('update');
  if (!chat) throw new Error('Conversation not found.');
  return chat;
}

/** Moves the chat to the next step of the assistant, with what that step needs. */
export async function setState(
  db: DatabaseExecutor,
  id: string,
  state: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  await db
    .update(waConversations)
    .set({ state, context: keepEntry(context), updatedAt: new Date() })
    .where(eq(waConversations.id, id));
}
