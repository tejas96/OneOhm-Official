import { LEDGER_ACCOUNTS } from '@oneohm/domain';
import { asc, inArray, isNotNull } from 'drizzle-orm';
import type { Database } from '../client';
import { ledgerAccounts, payables, paymentMilestones, payments } from '../schema';
import { postPayableApproved, postPayablePaid } from './payable-postings';
import { postMilestoneDue, postPayment } from './receivable-postings';

/** The chart of accounts. Safe to run again: names follow the code, nothing is removed. */
export async function seedLedgerAccounts(db: Database): Promise<void> {
  for (const account of LEDGER_ACCOUNTS) {
    await db
      .insert(ledgerAccounts)
      .values(account)
      .onConflictDoUpdate({ target: ledgerAccounts.code, set: { name: account.name } });
  }
}

export interface BackfillResult {
  readonly milestones: number;
  readonly payments: number;
  readonly payables: number;
}

/**
 * Posts every past event that has no journal entry yet: milestones that fell due,
 * payments, and approved or paid bills (including bills other modules wrote straight
 * into `payables`). Each posting happens once, so this runs on every start and seed.
 */
export async function backfillLedger(db: Database): Promise<BackfillResult> {
  await seedLedgerAccounts(db);
  const due = await db
    .select({ id: paymentMilestones.id })
    .from(paymentMilestones)
    .where(isNotNull(paymentMilestones.dueAt));
  for (const { id } of due) {
    await db.transaction((tx) => postMilestoneDue(tx, id, null));
  }
  const received = await db
    .select({ id: payments.id })
    .from(payments)
    .orderBy(asc(payments.createdAt), asc(payments.id));
  for (const { id } of received) {
    await db.transaction((tx) => postPayment(tx, id, null));
  }
  const bills = await db
    .select({ id: payables.id, status: payables.status })
    .from(payables)
    .where(inArray(payables.status, ['approved', 'paid']));
  for (const bill of bills) {
    await db.transaction(async (tx) => {
      await postPayableApproved(tx, bill.id, null);
      if (bill.status === 'paid') await postPayablePaid(tx, bill.id, null);
    });
  }
  return { milestones: due.length, payments: received.length, payables: bills.length };
}
