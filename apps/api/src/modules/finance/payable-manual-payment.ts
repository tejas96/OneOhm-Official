import { payables, recordPayablePayment, type Transaction } from '@oneohm/database';
import { leftToPay, type MoneyOutMethod, partPaymentProblem } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { assertNotFuture } from '../../common/dates';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { assertNoOpenPayout } from './payable-payout-guard';

export interface ManualPayment {
  method: MoneyOutMethod;
  paidOn: string;
  reference?: string | null | undefined;
  /** A part of the bill; left out means all that is left. */
  amountPaise?: number | undefined;
}

/**
 * A payment recorded by hand, in the caller's transaction. The bill is locked first (and
 * refused while a bank transfer is on its way), then the amount is checked against what is
 * left at that moment, so two people paying at once cannot pay more than the bill.
 */
export async function recordManualPayment(
  tx: Transaction,
  actor: Actor,
  id: string,
  input: ManualPayment,
): Promise<void> {
  assertNotFuture(input.paidOn, 'paidOn');
  await assertNoOpenPayout(tx, id);
  const [bill] = await tx.select().from(payables).where(eq(payables.id, id));
  if (!bill) throw notFound('That bill');
  if (bill.status === 'pending') {
    throw conflict(`This ${formatInr(bill.amountPaise)} bill needs approval before it is paid.`);
  }
  if (bill.status === 'paid') throw conflict('This bill is already paid.');
  const left = leftToPay(bill);
  const amountPaise = input.amountPaise ?? left;
  const problem = partPaymentProblem(amountPaise, left);
  if (problem) throw invalid(problem, { amountPaise: problem });
  const done = await recordPayablePayment(tx, {
    payableId: id,
    amountPaise,
    method: input.method,
    paidOn: input.paidOn,
    reference: input.reference ?? null,
    userId: actor.userId,
  });
  if (!done) throw conflict('This payment could not be recorded.');
  await recordAudit(tx, actor.userId, 'payable.paid', 'payable', id, {
    amountPaise,
    leftAfterPaise: left - amountPaise,
    method: input.method,
    part: amountPaise < left,
  });
}
