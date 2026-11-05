import type { PayablePayment } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  notifyHolders,
  payablePayments,
  payables,
  type Transaction,
  undoManualPayment,
  users,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { desc, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, notFound } from '../../common/http/errors';

/** The person who recorded a payment may undo it themselves for this long. */
const OWN_UNDO_MS = 24 * 3_600_000;

export const BANK_UNDO_TEXT = 'Bank transfers come back only through the bank.';

interface PaymentRow {
  readonly paidByUserId: string | null;
  readonly createdAt: Date;
  readonly reversedAt: Date | null;
  readonly bankPayoutId: string | null;
}

/**
 * Approvers may undo any hand-recorded payment. Whoever records payments may undo their
 * own for 24 hours. Bank transfers and payments already undone never can.
 */
export function mayUndo(actor: Actor, payment: PaymentRow, now = Date.now()): boolean {
  if (payment.reversedAt !== null || payment.bankPayoutId !== null) return false;
  if (can(actor, 'finance.approve_payments')) return true;
  return (
    can(actor, 'finance.record_payments') &&
    payment.paidByUserId !== null &&
    payment.paidByUserId === actor.userId &&
    now - payment.createdAt.getTime() <= OWN_UNDO_MS
  );
}

/** Every payment on a bill, newest first. */
export async function listBillPayments(
  db: DatabaseExecutor,
  actor: Actor,
  payableId: string,
): Promise<PayablePayment[]> {
  const [bill] = await db
    .select({ id: payables.id })
    .from(payables)
    .where(eq(payables.id, payableId));
  if (!bill) throw notFound('That bill');
  const rows = await db
    .select({ payment: payablePayments, who: users.fullName })
    .from(payablePayments)
    .leftJoin(users, eq(users.id, payablePayments.paidByUserId))
    .where(eq(payablePayments.payableId, payableId))
    .orderBy(desc(payablePayments.paidOn), desc(payablePayments.createdAt));
  return rows.map(({ payment, who }) => ({
    id: payment.id,
    amountPaise: payment.amountPaise,
    method: payment.method as PayablePayment['method'],
    paidOn: payment.paidOn,
    reference: payment.reference,
    paidBy: who,
    bank: payment.bankPayoutId !== null,
    reversed: payment.reversedAt !== null,
    reversalReason: payment.reversalReason,
    canUndo: mayUndo(actor, payment),
    createdAt: payment.createdAt.toISOString(),
  }));
}

/**
 * Undoes one hand-recorded payment in the caller's transaction: the payment is marked
 * reversed, its ledger entry is reversed, the bill is reopened if money is owed again, and
 * finance approvers are told. Nothing is ever deleted.
 */
export async function undoBillPayment(
  tx: Transaction,
  actor: Actor,
  payableId: string,
  paymentId: string,
  reason: string,
): Promise<void> {
  const [payment] = await tx
    .select()
    .from(payablePayments)
    .where(eq(payablePayments.id, paymentId));
  if (!payment || payment.payableId !== payableId) throw notFound('That payment');
  if (payment.bankPayoutId !== null) throw conflict(BANK_UNDO_TEXT, 'bank_payment');
  if (payment.reversedAt !== null) throw conflict('This payment was already undone.');
  if (!mayUndo(actor, payment)) {
    throw forbidden(
      'You can undo your own payment for 24 hours. After that, ask someone who approves payments.',
    );
  }
  const result = await undoManualPayment(tx, {
    payableId,
    paymentId,
    reason,
    userId: actor.userId,
  });
  if (!result.done) {
    throw result.why === 'bank'
      ? conflict(BANK_UNDO_TEXT, 'bank_payment')
      : result.why === 'already_undone'
        ? conflict('This payment was already undone.')
        : notFound('That payment');
  }
  await recordAudit(tx, actor.userId, 'payable.payment_undone', 'payable', payableId, {
    paymentId,
    amountPaise: result.amountPaise,
    reason,
    reopened: result.reopened,
  });
  const [bill] = await tx
    .select({ name: payables.partyName, projectId: payables.projectId })
    .from(payables)
    .where(eq(payables.id, payableId));
  await notifyHolders(
    tx,
    'finance.approve_payments',
    {
      kind: 'payable_payment_undone',
      title: `${formatInr(result.amountPaise)} payment to ${bill?.name ?? 'a payee'} was undone`,
      body: `Reason: ${reason}`,
      dedupeKey: `payable_payment_undone:${paymentId}`,
      subject: { type: 'payable', id: payableId, projectId: bill?.projectId ?? null },
    },
    actor.userId,
  );
}
