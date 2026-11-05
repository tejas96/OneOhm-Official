import { type DatabaseExecutor, outbox, waConversations, waMessages } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { CHAT_WINDOW_CLOSED } from './send-checks';

/**
 * A form message that could not be delivered (a wrong flow id, a flow Meta refuses) must not
 * leave the customer with nothing: the plain words it carried (`fallbackText`, which ask for the
 * photo or PDF here) go instead, as an ordinary chat message. The team's alert about the failed
 * form stays. Queued once per form message. A closed chat window needs no fallback (it fails too).
 */
export async function queueFlowFallback(
  db: DatabaseExecutor,
  id: string,
  reason: string,
): Promise<void> {
  if (reason === CHAT_WINDOW_CLOSED) return;
  const [row] = await db.select().from(outbox).where(eq(outbox.id, id));
  const text = (row?.payload as { fallbackText?: string } | null)?.fallbackText;
  if (row?.template !== 'session:flow' || !text) return;
  const [made] = await db
    .insert(outbox)
    .values({
      channel: 'whatsapp',
      recipient: row.recipient,
      template: 'session:text',
      payload: { kind: 'text', body: text },
      dedupeKey: `flow-fallback:${id}`,
    })
    .onConflictDoNothing()
    .returning({ id: outbox.id });
  if (!made) return;
  const [chat] = await db
    .select({ id: waConversations.id })
    .from(waConversations)
    .where(eq(waConversations.phone, row.recipient));
  if (chat)
    await db.insert(waMessages).values({
      conversationId: chat.id,
      direction: 'out',
      kind: 'text',
      body: text,
      outboxId: made.id,
    });
}
