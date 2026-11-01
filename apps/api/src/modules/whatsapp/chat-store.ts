import { randomUUID } from 'node:crypto';
import {
  customers,
  type DatabaseExecutor,
  outbox,
  waConversations,
  waMessages,
} from '@oneohm/database';
import { eq } from 'drizzle-orm';
import type { Incoming } from './whatsapp-events';

/** A reply inside WhatsApp's 24-hour window; the worker sends it like any message. */
export type ChatReply =
  | { readonly kind: 'text'; readonly body: string }
  | {
      readonly kind: 'buttons';
      readonly body: string;
      readonly buttons: readonly { readonly id: string; readonly title: string }[];
    }
  | {
      readonly kind: 'list';
      readonly body: string;
      readonly button: string;
      readonly rows: readonly {
        readonly id: string;
        readonly title: string;
        readonly description?: string;
      }[];
    };

export type Conversation = typeof waConversations.$inferSelect;

/** The chat for this number, made on first contact and linked to the customer who owns it. */
export async function conversationFor(
  db: DatabaseExecutor,
  incoming: Incoming,
): Promise<Conversation> {
  const [owner] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phoneE164, incoming.from))
    .limit(1);
  const values = {
    customerId: owner?.id ?? null,
    profileName: incoming.profileName,
    lastInboundAt: incoming.at,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(waConversations)
    .values({ phone: incoming.from, ...values })
    .onConflictDoUpdate({ target: waConversations.phone, set: values })
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
    })
    .onConflictDoNothing()
    .returning({ id: waMessages.id });
  return saved.length > 0;
}

function summary(reply: ChatReply): string {
  if (reply.kind === 'text') return reply.body;
  const options =
    reply.kind === 'buttons'
      ? reply.buttons.map((button) => button.title)
      : reply.rows.map((row) => row.title);
  return `${reply.body}\n[${options.join(' · ')}]`;
}

/** Queues a reply for the worker and keeps it in the chat history. */
export async function queueReply(
  db: DatabaseExecutor,
  conversation: Pick<Conversation, 'id' | 'phone'>,
  reply: ChatReply,
  sentByUserId: string | null = null,
): Promise<void> {
  const [row] = await db
    .insert(outbox)
    .values({
      channel: 'whatsapp',
      recipient: conversation.phone,
      template: `session:${reply.kind}`,
      payload: reply,
      dedupeKey: `chat:${randomUUID()}`,
    })
    .returning({ id: outbox.id });
  await db.insert(waMessages).values({
    conversationId: conversation.id,
    direction: 'out',
    kind: reply.kind,
    body: summary(reply),
    outboxId: row?.id ?? null,
    sentByUserId,
  });
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
    .set({ state, context, updatedAt: new Date() })
    .where(eq(waConversations.id, id));
}
