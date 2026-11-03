import type { ChatSummary } from '@oneohm/api-contracts';
import { chatsWaitingSince, customers, users, waConversations, waMessages } from '@oneohm/database';
import { chatWaitStage, chatWindowOpen } from '@oneohm/domain';
import { desc, eq, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '../../config/core.module';
import type { Environment } from '../../config/environment';

const assignee = alias(users, 'assignee');

/** Waiting over 2 working hours for a person's answer. */
function isLate(since: Date | undefined, now: Date, env: Environment): boolean {
  return since !== undefined && chatWaitStage(since, now, env.BUSINESS_TIMEZONE) === 2;
}

/** The inbox rows for the chats matching `where`, newest first, with last message and wait state. */
export async function chatSummaries(
  db: Database,
  env: Environment,
  where: SQL | undefined,
  limit: number,
): Promise<ChatSummary[]> {
  const rows = await db
    .select({
      chat: waConversations,
      customer: customers.name,
      assigneeName: assignee.fullName,
    })
    .from(waConversations)
    .leftJoin(customers, eq(customers.id, waConversations.customerId))
    .leftJoin(assignee, eq(assignee.id, waConversations.assignedUserId))
    .where(where)
    .orderBy(desc(waConversations.updatedAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const last = await db
    .selectDistinctOn([waMessages.conversationId], {
      conversationId: waMessages.conversationId,
      body: waMessages.body,
      direction: waMessages.direction,
      at: waMessages.createdAt,
    })
    .from(waMessages)
    .where(
      inArray(
        waMessages.conversationId,
        rows.map(({ chat }) => chat.id),
      ),
    )
    .orderBy(waMessages.conversationId, desc(waMessages.createdAt));
  const lastBy = new Map(last.map((row) => [row.conversationId, row]));
  const waiting = await chatsWaitingSince(
    db,
    rows.map(({ chat }) => chat.id),
  );
  const now = new Date();
  return rows.map(({ chat, customer, assigneeName }) => {
    const message = lastBy.get(chat.id);
    return {
      id: chat.id,
      phone: chat.phone,
      name: customer ?? chat.profileName ?? chat.phone,
      customerId: chat.customerId,
      state: chat.state,
      handedOverAt: chat.handedOverAt?.toISOString() ?? null,
      handledByUserId: chat.handledByUserId,
      assignee:
        chat.assignedUserId && assigneeName
          ? { id: chat.assignedUserId, name: assigneeName }
          : null,
      // A person has the chat and the customer spoke last: someone owes them an answer.
      needsReply: chat.state === 'human' && waiting.has(chat.id),
      late: chat.state === 'human' && isLate(waiting.get(chat.id), now, env),
      lastMessage: message
        ? {
            body: message.body,
            direction: message.direction as 'in' | 'out',
            at: message.at.toISOString(),
          }
        : null,
      lastInboundAt: chat.lastInboundAt?.toISOString() ?? null,
      windowOpen: chatWindowOpen(chat.lastInboundAt),
      optedOut: chat.optedOutAt !== null,
    };
  });
}
