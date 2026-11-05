import {
  bankPayouts,
  postPayoutFee,
  recordPayablePayment,
  refundPayoutFee,
  reversePayoutPayment,
  type Transaction,
} from '@oneohm/database';
import { overpaidBy } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { tellPayee } from './payee-message';
import { type BillInfo, type PayoutRow, tellFinance } from './payout-alerts';

/** Ends a reason with exactly one full stop, whatever RazorpayX or we wrote. */
const sentence = (text: string): string => `${text.trim().replace(/[.\s]+$/, '')}.`;

/**
 * The RazorpayX fee is booked once per payout: the fee without GST as a bank charge, the GST
 * as input credit (the ledger dedupes by payout).
 */
export async function bookFee(
  tx: Transaction,
  row: PayoutRow,
  bill: BillInfo,
  feePaise: number,
  taxPaise: number,
) {
  await postPayoutFee(tx, {
    id: row.id,
    feePaise,
    feeTaxPaise: taxPaise,
    paidOn: todayIn(),
    label: bill.name,
    projectId: bill.projectId,
  });
}

/** RazorpayX gives the fee and its GST back when a payout fails or comes back. */
export async function refundFee(tx: Transaction, row: PayoutRow, bill: BillInfo) {
  await refundPayoutFee(tx, { id: row.id, paidOn: todayIn(), label: bill.name });
}

/**
 * The money reached the payee: it is recorded as a payment on the bill, with the UTR as its
 * reference, and the bill is paid once nothing is left. A transfer settles at most once. If
 * the transfer is more than what was left (the bill was paid another way meanwhile), it is
 * still recorded, because the money has gone, and finance is told loudly.
 * `afterFailure` is true when we had called the payout failed and RazorpayX says otherwise.
 */
export async function settle(
  tx: Transaction,
  row: PayoutRow,
  bill: BillInfo,
  utr: string | null,
  afterFailure: boolean,
) {
  const paidOn = todayIn();
  const done = await recordPayablePayment(tx, {
    payableId: row.payableId,
    amountPaise: row.amountPaise,
    method: 'bank_transfer',
    paidOn,
    reference: `RazorpayX ${utr ?? row.providerPayoutId ?? row.id}`,
    bankPayoutId: row.id,
    userId: row.requestedByUserId,
  });
  if (!done) return;
  // The money reached them, so the payee is told (when the message is on), whatever the bill's state.
  await tx
    .update(bankPayouts)
    .set({ paidOn, payeeTold: await tellPayee(tx, row, paidOn, utr) })
    .where(eq(bankPayouts.id, row.id));
  const extra = overpaidBy(row.amountPaise, done.leftBeforePaise);
  await recordAudit(tx, null, 'payable.paid', 'payable', row.payableId, {
    by: 'razorpayx',
    utr,
    amountPaise: row.amountPaise,
    paymentId: done.paymentId,
    afterFailure,
  });
  if (extra > 0) return paidTooMuch(tx, row, bill, utr, extra);
  const stillLeft = done.leftBeforePaise - row.amountPaise;
  await tellFinance(
    tx,
    bill,
    {
      kind: 'payout_processed',
      title: afterFailure
        ? `It went through after all: ${formatInr(row.amountPaise)} reached ${bill.name}`
        : `${formatInr(row.amountPaise)} reached ${bill.name}`,
      body: `Bank transfer done${utr ? `, UTR ${utr}` : ''}. ${
        stillLeft > 0 ? `${formatInr(stillLeft)} is still left to pay.` : 'The bill is marked paid.'
      }`,
      dedupeKey: `payout_processed:${row.id}`,
    },
    { capability: 'finance.record_payments' },
  );
}

/** Money went out beyond what the bill was waiting for: someone must look. */
async function paidTooMuch(
  tx: Transaction,
  row: PayoutRow,
  bill: BillInfo,
  utr: string | null,
  extraPaise: number,
) {
  await recordAudit(tx, null, 'payout.paid_twice', 'payable', row.payableId, {
    payoutId: row.id,
    utr,
    amountPaise: row.amountPaise,
    extraPaise,
  });
  await tellFinance(tx, bill, {
    kind: 'payout_paid_twice',
    title: `${bill.name} was paid ${formatInr(extraPaise)} more than the bill`,
    body: `${formatInr(row.amountPaise)} went by bank${utr ? `, UTR ${utr}` : ''}, but only part of that was left to pay. Check the bill, and ask the payee to send the extra money back if needed.`,
    dedupeKey: `payout_paid_twice:${row.id}`,
  });
}

/** It did not arrive: the bill stays to pay. */
export async function warnFailed(
  tx: Transaction,
  row: PayoutRow,
  bill: BillInfo,
  reason: string | null,
) {
  await tellFinance(tx, bill, {
    kind: 'payout_failed',
    title: `Bank transfer to ${bill.name} did not go through`,
    body: `${formatInr(row.amountPaise)}: ${sentence(reason ?? 'the bank did not accept it')} The bill is still to pay.`,
    dedupeKey: `payout_failed:${row.id}`,
  });
}

/**
 * The money came back after it was paid. That one payment is reversed (found by the
 * transfer) with its ledger entry; the bill goes back to approved if something is left to
 * pay again, and finance is told. All in the caller's transaction. The fee is given back by the caller.
 */
export async function reverseSettlement(
  tx: Transaction,
  row: PayoutRow,
  bill: BillInfo,
  reason: string | null,
) {
  const text = reason ?? 'the bank sent it back';
  const undone = await reversePayoutPayment(tx, {
    payableId: row.payableId,
    bankPayoutId: row.id,
    reason: `Bank transfer came back: ${text}`,
    userId: null,
  });
  await recordAudit(tx, null, 'payout.reversed', 'payable', row.payableId, {
    payoutId: row.id,
    reason: text,
    amountPaise: row.amountPaise,
    reopened: undone?.reopened ?? false,
  });
  const next = undone
    ? undone.reopened
      ? 'The bill is to pay again.'
      : 'That part is to pay again.'
    : 'Check the bill in Finance.';
  await tellFinance(tx, bill, {
    kind: 'payout_reversed',
    title: `Money came back from ${bill.name}`,
    body: `${formatInr(row.amountPaise)}: ${sentence(text)} ${next}`,
    dedupeKey: `payout_reversed:${row.id}`,
  });
}
