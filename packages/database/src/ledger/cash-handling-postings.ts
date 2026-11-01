import {
  ACCOUNT,
  cashDepositPosting,
  chequeClearedPosting,
  isHandledMethod,
  type LedgerAccountCode,
  moneyAccountNow,
} from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { paymentHandling } from '../schema/cash-handling.schema';
import { payments } from '../schema/finance.schema';
import { postJournal } from './post-journal';

/** The cash on a deposit slip leaves "Cash in hand" for the bank (PRD 3.11). */
export async function postCashDeposit(
  db: DatabaseExecutor,
  deposit: {
    readonly id: string;
    readonly number: string;
    readonly depositedOn: string;
    readonly cashPaise: number;
  },
  userId: string | null,
): Promise<void> {
  if (deposit.cashPaise <= 0) return;
  await postJournal(db, {
    entryDate: deposit.depositedOn,
    memo: `${deposit.number} · ${formatInr(deposit.cashPaise)} cash paid into the bank`,
    sourceType: 'cash_deposit',
    sourceId: deposit.id,
    projectId: null,
    postedByUserId: userId,
    lines: cashDepositPosting(deposit.cashPaise),
  });
}

/** A cheque cleared: it moves from "Cheques in hand" to the bank. */
export async function postChequeCleared(
  db: DatabaseExecutor,
  cheque: {
    readonly paymentId: string;
    readonly projectId: string;
    readonly amountPaise: number;
    readonly clearedOn: string;
    readonly label: string;
  },
  userId: string | null,
): Promise<void> {
  await postJournal(db, {
    entryDate: cheque.clearedOn,
    memo: `${cheque.label} · ${formatInr(cheque.amountPaise)} cheque cleared`,
    sourceType: 'cheque_cleared',
    sourceId: cheque.paymentId,
    projectId: cheque.projectId,
    postedByUserId: userId,
    lines: chequeClearedPosting(cheque.amountPaise),
  });
}

/**
 * For reversing a cash or cheque payment: the account its money was first booked in,
 * moved to where the money is now (deposited cash and cleared cheques are in the bank).
 */
export async function handlingRemap(
  db: DatabaseExecutor,
  paymentId: string,
): Promise<Partial<Record<LedgerAccountCode, LedgerAccountCode>>> {
  const [row] = await db
    .select({ method: payments.method, status: paymentHandling.status })
    .from(paymentHandling)
    .innerJoin(payments, eq(payments.id, paymentHandling.paymentId))
    .where(eq(paymentHandling.paymentId, paymentId))
    .limit(1);
  if (!row || !isHandledMethod(row.method)) return {};
  const booked = row.method === 'cash' ? ACCOUNT.cash : ACCOUNT.chequesInHand;
  const now = moneyAccountNow(row.method, row.status);
  return booked === now ? {} : { [booked]: now };
}
