import type { PayoutRequest } from '@oneohm/api-contracts';
import { type DatabaseExecutor, payoutRequests, users } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';

export type RequestRow = typeof payoutRequests.$inferSelect;

/** The open "ask to send" for a bill, if any (there is at most one). */
export async function openRequestOf(
  db: DatabaseExecutor,
  payableId: string,
): Promise<RequestRow | null> {
  const [row] = await db
    .select()
    .from(payoutRequests)
    .where(and(eq(payoutRequests.payableId, payableId), eq(payoutRequests.status, 'open')))
    .limit(1);
  return row ?? null;
}

/** The request as the screen shows it, with the asker's name. */
export async function presentRequest(
  db: DatabaseExecutor,
  row: RequestRow,
  viewerId: string,
): Promise<PayoutRequest> {
  const [asker] = row.requestedByUserId
    ? await db
        .select({ name: users.fullName })
        .from(users)
        .where(eq(users.id, row.requestedByUserId))
    : [];
  return {
    id: row.id,
    amountPaise: row.amountPaise,
    requestedByUserId: row.requestedByUserId,
    requestedByName: asker?.name ?? null,
    requestedAt: row.createdAt.toISOString(),
    mine: row.requestedByUserId === viewerId,
  };
}

/** Ends an open request: the money was sent, it was taken back, or it was declined. */
export async function closeRequest(
  db: DatabaseExecutor,
  id: string,
  status: 'sent' | 'withdrawn' | 'declined',
  by: string | null,
  note?: string,
): Promise<boolean> {
  const done = await db
    .update(payoutRequests)
    .set({
      status,
      decidedByUserId: by,
      decidedAt: new Date(),
      ...(note ? { decisionNote: note } : {}),
    })
    .where(and(eq(payoutRequests.id, id), eq(payoutRequests.status, 'open')))
    .returning({ id: payoutRequests.id });
  return done.length > 0;
}
