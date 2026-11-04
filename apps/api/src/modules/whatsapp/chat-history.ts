import type { ChatDetail } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documents, outbox, users, waMessages } from '@oneohm/database';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { deliveryState } from './delivery-state';

/** A chat's newest 200 messages, oldest first, with delivery, sender and any kept file. */
export async function chatMessages(
  db: DatabaseExecutor,
  conversationId: string,
): Promise<ChatDetail['messages']> {
  const rows = await db
    .select({
      message: waMessages,
      status: outbox.status,
      deliveryStatus: outbox.deliveryStatus,
      sentBy: users.fullName,
      file: { id: documents.id, name: documents.name, contentType: documents.contentType },
    })
    .from(waMessages)
    .leftJoin(outbox, eq(outbox.id, waMessages.outboxId))
    .leftJoin(users, eq(users.id, waMessages.sentByUserId))
    .leftJoin(documents, and(eq(documents.id, waMessages.documentId), isNull(documents.removedAt)))
    .where(eq(waMessages.conversationId, conversationId))
    .orderBy(desc(waMessages.createdAt))
    .limit(200); // the newest 200, shown oldest first
  return rows.reverse().map(({ message, status, deliveryStatus, sentBy, file }) => ({
    id: message.id,
    direction: message.direction as 'in' | 'out',
    kind: message.kind,
    body: message.body,
    at: message.createdAt.toISOString(),
    delivery: status ? deliveryState({ status, deliveryStatus }) : null,
    sentBy,
    file: file?.id ? file : null,
  }));
}
