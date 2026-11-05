import { bankPayouts, type DatabaseExecutor, notifyHolders, payables } from '@oneohm/database';
import { eq } from 'drizzle-orm';

export type PayoutRow = typeof bankPayouts.$inferSelect;

export interface BillInfo {
  readonly id: string;
  readonly name: string;
  readonly projectId: string | null;
}

export async function billOf(db: DatabaseExecutor, payableId: string): Promise<BillInfo> {
  const [bill] = await db
    .select({ name: payables.partyName, projectId: payables.projectId })
    .from(payables)
    .where(eq(payables.id, payableId));
  return { id: payableId, name: bill?.name ?? 'a payee', projectId: bill?.projectId ?? null };
}

/**
 * Tells finance about a payout. The alert is about the bill, so it opens that bill in
 * Finance. Finance people who record payments hear good news; approvers hear the rest.
 */
export function tellFinance(
  db: DatabaseExecutor,
  bill: BillInfo,
  notice: { kind: string; title: string; body: string; dedupeKey: string },
  options: { capability?: string; exceptUserId?: string | null } = {},
): Promise<number> {
  return notifyHolders(
    db,
    options.capability ?? 'finance.approve_payments',
    { ...notice, subject: { type: 'payable', id: bill.id, projectId: bill.projectId } },
    options.exceptUserId,
  );
}
