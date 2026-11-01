import { LEDGER_ACCOUNTS } from '@oneohm/domain';
import { and, asc, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import type { Database } from '../client';
import {
  customerCredits,
  customerRefunds,
  ledgerAccounts,
  payables,
  paymentMilestones,
  payments,
  workOrders,
} from '../schema';
import { postCustomerCredit, postCustomerRefund } from './customer-credit-postings';
import { postPayableApproved, postPayablePaid, postWorkOrderTds } from './payable-postings';
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
  const settled = await db
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(and(eq(workOrders.status, 'completed'), gt(workOrders.tdsPaise, 0)));
  for (const { id } of settled) {
    await db.transaction((tx) => postWorkOrderTds(tx, id, null));
  }
  await backfillCustomerMoney(db);
  return { milestones: due.length, payments: received.length, payables: bills.length };
}

/** Customer credit held and refunds paid, oldest first. */
async function backfillCustomerMoney(db: Database): Promise<void> {
  const credits = await db
    .select({ id: customerCredits.id })
    .from(customerCredits)
    .orderBy(asc(customerCredits.createdAt));
  for (const { id } of credits) {
    await db.transaction((tx) => postCustomerCredit(tx, id, null));
  }
  const refunds = await db
    .select({ id: customerRefunds.id })
    .from(customerRefunds)
    .orderBy(asc(customerRefunds.createdAt));
  for (const { id } of refunds) {
    await db.transaction((tx) => postCustomerRefund(tx, id, null));
  }
}
