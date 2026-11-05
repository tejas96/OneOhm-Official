import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import type { PendingApprovalRow } from './pending-approvals';
import { payables } from './schema/finance.schema';
import { users } from './schema/identity.schema';
import { payoutRequests } from './schema/payouts.schema';
import { projects } from './schema/projects.schema';

/**
 * "Ask to send" requests waiting for an approver: "Send ₹X to <payee>". The inbox item is
 * the bill (its id), the amount is what was asked for, and the asker can never act on it.
 */
export async function bankPayoutRows(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const rows = await db
    .select({
      payableId: payables.id,
      at: payoutRequests.createdAt,
      by: payoutRequests.requestedByUserId,
      amount: payoutRequests.amountPaise,
      payee: payables.partyName,
      name: users.fullName,
      projectId: payables.projectId,
      code: projects.code,
    })
    .from(payoutRequests)
    .innerJoin(payables, eq(payables.id, payoutRequests.payableId))
    .leftJoin(users, eq(users.id, payoutRequests.requestedByUserId))
    .leftJoin(projects, eq(projects.id, payables.projectId))
    // A bill paid or put back since the request has nothing left to send.
    .where(and(eq(payoutRequests.status, 'open'), eq(payables.status, 'approved')));
  return rows.map((row) => ({
    kind: 'bank_payout' as const,
    id: row.payableId,
    requestedAt: row.at.toISOString(),
    requestedByUserId: row.by,
    amountPaise: row.amount,
    // The payee alone: each screen words the line ("Send ₹X to …") in its own language.
    subject: row.payee,
    requesterName: row.name,
    projectId: row.projectId,
    projectCode: row.code,
  }));
}
