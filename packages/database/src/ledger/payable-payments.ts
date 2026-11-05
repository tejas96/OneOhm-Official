import { leftToPay, type MoneyOutMethod } from '@oneohm/domain';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { payablePayments, payables } from '../schema';
import { postPayablePayment, reversePayablePaymentEntry } from './payable-payment-postings';

export interface NewPayablePayment {
  readonly payableId: string;
  readonly amountPaise: number;
  readonly method: MoneyOutMethod;
  readonly paidOn: string;
  readonly reference: string | null;
  /** Set when a bank transfer made the payment: that transfer can settle only once. */
  readonly bankPayoutId?: string | null;
  readonly userId: string | null;
}

async function lockBill(db: DatabaseExecutor, payableId: string) {
  const [bill] = await db.select().from(payables).where(eq(payables.id, payableId)).for('update');
  return bill;
}

/**
 * Makes `paid_paise` and the status match the bill's payments, in the caller's transaction
 * (the bill row must be locked). The bill is paid when nothing is left, taking its paid
 * details from the latest payment; if a reversal leaves something to pay it is approved
 * again. Returns the status change, if any.
 */
export async function refreshPaidState(
  db: DatabaseExecutor,
  payableId: string,
): Promise<'paid' | 'reopened' | null> {
  const bill = await lockBill(db, payableId);
  if (!bill) return null;
  const [total] = await db
    .select({ sum: sql<string>`coalesce(sum(${payablePayments.amountPaise}), 0)` })
    .from(payablePayments)
    .where(and(eq(payablePayments.payableId, payableId), isNull(payablePayments.reversedAt)));
  const paidPaise = Number(total?.sum ?? 0);
  const left = leftToPay({ ...bill, paidPaise });
  const [latest] = await db
    .select()
    .from(payablePayments)
    .where(and(eq(payablePayments.payableId, payableId), isNull(payablePayments.reversedAt)))
    .orderBy(desc(payablePayments.paidOn), desc(payablePayments.createdAt))
    .limit(1);
  const now = new Date();
  if (bill.status === 'approved' && left === 0 && latest) {
    await db
      .update(payables)
      .set({
        paidPaise,
        status: 'paid',
        paidAt: now,
        paidOn: latest.paidOn,
        paidMethod: latest.method,
        paidReference: latest.reference,
        paidByUserId: latest.paidByUserId,
        updatedAt: now,
      })
      .where(eq(payables.id, payableId));
    return 'paid';
  }
  if (bill.status === 'paid' && left > 0) {
    await db
      .update(payables)
      .set({
        paidPaise,
        status: 'approved',
        paidAt: null,
        paidOn: null,
        paidMethod: null,
        paidReference: null,
        paidByUserId: null,
        updatedAt: now,
      })
      .where(eq(payables.id, payableId));
    return 'reopened';
  }
  await db.update(payables).set({ paidPaise, updatedAt: now }).where(eq(payables.id, payableId));
  return null;
}

/**
 * Records one payment (all of a bill or a part): the row, its own ledger entry, and the
 * bill's paid-so-far and status, all in the caller's transaction with the bill locked.
 * Returns null when this bank transfer already made its payment. `leftBeforePaise` is what
 * was left just before, so a caller can tell when more than the bill was paid.
 */
export async function recordPayablePayment(
  db: DatabaseExecutor,
  input: NewPayablePayment,
): Promise<{
  paymentId: string;
  leftBeforePaise: number;
  billStatus: 'paid' | null;
} | null> {
  const bill = await lockBill(db, input.payableId);
  if (!bill) return null;
  const [payment] = await db
    .insert(payablePayments)
    .values({
      payableId: input.payableId,
      amountPaise: input.amountPaise,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference,
      bankPayoutId: input.bankPayoutId ?? null,
      paidByUserId: input.userId,
    })
    .onConflictDoNothing()
    .returning({ id: payablePayments.id });
  if (!payment) return null;
  await postPayablePayment(db, payment.id, input.userId);
  const change = await refreshPaidState(db, input.payableId);
  return {
    paymentId: payment.id,
    leftBeforePaise: leftToPay(bill),
    billStatus: change === 'paid' ? 'paid' : null,
  };
}

/**
 * The money of a bank transfer came back: that one payment is marked reversed (found by
 * the transfer, not by any text), its ledger entry is reversed, and the bill is reopened if
 * something is left to pay again. Returns null when the transfer had made no payment.
 */
export async function reversePayoutPayment(
  db: DatabaseExecutor,
  input: { payableId: string; bankPayoutId: string; reason: string; userId: string | null },
): Promise<{ paymentId: string; reopened: boolean } | null> {
  await lockBill(db, input.payableId);
  const [payment] = await db
    .select()
    .from(payablePayments)
    .where(
      and(eq(payablePayments.bankPayoutId, input.bankPayoutId), isNull(payablePayments.reversedAt)),
    )
    .for('update');
  if (!payment) return null;
  await db
    .update(payablePayments)
    .set({ reversedAt: new Date(), reversalReason: input.reason })
    .where(eq(payablePayments.id, payment.id));
  await reversePayablePaymentEntry(db, payment, input.userId, input.reason);
  const change = await refreshPaidState(db, input.payableId);
  return { paymentId: payment.id, reopened: change === 'reopened' };
}

/**
 * A payment recorded by hand was a mistake: that one payment is marked reversed (with the
 * reason), its own ledger entry is reversed, and the bill is reopened if something is left
 * to pay again. A payment made before part payments began is booked under the bill's old
 * "bill paid" entry; `reversePayablePaymentEntry` finds it there. Bank payments are refused:
 * they come back only through the bank. Returns why nothing was done, or the result.
 */
export async function undoManualPayment(
  db: DatabaseExecutor,
  input: { payableId: string; paymentId: string; reason: string; userId: string | null },
): Promise<
  | { done: true; amountPaise: number; reopened: boolean }
  | { done: false; why: 'missing' | 'bank' | 'already_undone' }
> {
  await lockBill(db, input.payableId);
  const [payment] = await db
    .select()
    .from(payablePayments)
    .where(
      and(eq(payablePayments.id, input.paymentId), eq(payablePayments.payableId, input.payableId)),
    )
    .for('update');
  if (!payment) return { done: false, why: 'missing' };
  if (payment.bankPayoutId !== null) return { done: false, why: 'bank' };
  if (payment.reversedAt !== null) return { done: false, why: 'already_undone' };
  await db
    .update(payablePayments)
    .set({ reversedAt: new Date(), reversalReason: input.reason })
    .where(eq(payablePayments.id, payment.id));
  await reversePayablePaymentEntry(db, payment, input.userId, input.reason);
  const change = await refreshPaidState(db, input.payableId);
  return { done: true, amountPaise: payment.amountPaise, reopened: change === 'reopened' };
}
