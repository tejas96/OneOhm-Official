import { type Database, outbox, recordDeliveryFailure, tellChatFileFailed } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';

/**
 * Marks a still-pending message failed so the office sees it and can resend it
 * (Settings → Automation runs, PRD 7.1); a chat file that never arrived also tells the
 * chat's people. A row that already finished is left alone.
 */
export async function failPendingDelivery(db: Database, id: string, reason: string): Promise<void> {
  const failed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(outbox)
      .set({ status: 'failed', lastError: reason })
      .where(and(eq(outbox.id, id), eq(outbox.status, 'pending')))
      .returning({ id: outbox.id });
    if (rows.length > 0) await tellChatFileFailed(tx, id);
    return rows;
  });
  if (failed.length > 0) await recordDeliveryFailure(db, id, reason);
}
