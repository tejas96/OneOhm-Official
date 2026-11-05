import { type MoneyOutMethod, payablePaidPosting } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { journalEntries, payablePayments } from '../schema';
import { loadPayable, memoOf } from './payable-postings';
import { postJournal } from './post-journal';
import { reverseEntry } from './receivable-postings';

const OUT_METHODS: readonly MoneyOutMethod[] = ['cash', 'cheque', 'bank_transfer', 'upi'];

/**
 * Where a payment's ledger entry lives. Each payment is booked under its own id, so two
 * parts of one bill never dedupe each other. The one exception: a payment made from a bill
 * that was already paid before part payments began (`fromOldBill`) is booked under the
 * bill's own "bill paid" entry, exactly as it was, so a rebuild of the ledger books that
 * money once and never twice.
 */
export const paymentSource = (payment: { id: string; payableId: string; fromOldBill: boolean }) =>
  payment.fromOldBill
    ? ({ sourceType: 'payable_paid', sourceId: payment.payableId } as const)
    : ({ sourceType: 'payable_payment', sourceId: payment.id } as const);

/**
 * One payment against a bill: what is owed goes down, and so does the bank or cash it came
 * from. TDS went to its own account on approval, and vendor advances set against the bill
 * were posted when adjusted, so only the money actually paid out is booked here.
 */
export async function postPayablePayment(
  db: DatabaseExecutor,
  paymentId: string,
  userId: string | null,
): Promise<void> {
  const [payment] = await db
    .select()
    .from(payablePayments)
    .where(eq(payablePayments.id, paymentId));
  if (!payment || payment.amountPaise <= 0) return;
  const row = await loadPayable(db, payment.payableId);
  if (!row) return;
  const { payable } = row;
  const method = OUT_METHODS.find((entry) => entry === payment.method) ?? 'bank_transfer';
  await postJournal(db, {
    entryDate: payment.paidOn,
    memo: `Bill paid · ${memoOf(row)}${payment.reference ? ` · ${payment.reference}` : ''}`,
    ...paymentSource(payment),
    projectId: payable.projectId,
    postedByUserId: userId,
    lines: payablePaidPosting({ party: payable.party, method, amountPaise: payment.amountPaise }),
  });
}

/** The money of one payment came back: its own entry is reversed, once. */
export async function reversePayablePaymentEntry(
  db: DatabaseExecutor,
  payment: { id: string; payableId: string; fromOldBill: boolean },
  userId: string | null,
  reason: string,
): Promise<string | null> {
  const source = paymentSource(payment);
  const [entry] = await db
    .select({
      id: journalEntries.id,
      number: journalEntries.number,
      projectId: journalEntries.projectId,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.sourceType, source.sourceType),
        eq(journalEntries.sourceId, source.sourceId),
      ),
    )
    .limit(1);
  return entry ? reverseEntry(db, entry, userId, reason) : null;
}
