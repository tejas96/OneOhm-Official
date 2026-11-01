import {
  bankPayouts,
  type Database,
  notifyHolders,
  payables,
  postPayablePaid,
  postPayoutFee,
  type Transaction,
} from '@oneohm/database';
import { isPayoutStatus, payoutFailed, payoutSucceeded } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';

interface PayoutEntity {
  id?: string;
  status?: string;
  utr?: string | null;
  fees?: number;
  failure_reason?: string | null;
  status_details?: { description?: string | null } | null;
}

type Row = typeof bankPayouts.$inferSelect;

/**
 * Applies a RazorpayX payout event (processed, failed, reversed and the steps between).
 * A processed payout marks the bill paid with its UTR and books the fee; a failed one
 * leaves the bill to pay and tells finance. Each payout settles once.
 */
export async function applyPayoutEvent(db: Database, body: unknown): Promise<string> {
  const entity = (body as { payload?: { payout?: { entity?: PayoutEntity } } }).payload?.payout
    ?.entity;
  if (!entity?.id || !entity.status || !isPayoutStatus(entity.status)) return 'ignored';
  const status = entity.status;
  const [row] = await db
    .select()
    .from(bankPayouts)
    .where(eq(bankPayouts.providerPayoutId, entity.id))
    .limit(1);
  if (!row) return 'unknown_payout';
  const wasPaid = payoutSucceeded(row.status);
  if (payoutFailed(row.status) || (wasPaid && status !== 'reversed')) return 'repeat';
  const reason = entity.status_details?.description ?? entity.failure_reason ?? null;
  await db.transaction(async (tx) => {
    await tx
      .update(bankPayouts)
      .set({
        status,
        utr: entity.utr ?? row.utr,
        feePaise: entity.fees ?? row.feePaise,
        failureReason: payoutFailed(status) ? (reason ?? 'The bank did not accept it.') : null,
        updatedAt: new Date(),
      })
      .where(eq(bankPayouts.id, row.id));
    if (payoutSucceeded(status)) await settle(tx, row, entity.utr ?? null, entity.fees ?? 0);
    if (payoutFailed(status)) await warn(tx, row, wasPaid, reason);
  });
  return status;
}

/** The money reached the payee: the bill is paid, with the UTR as its reference. */
async function settle(tx: Transaction, row: Row, utr: string | null, feePaise: number) {
  const paidOn = todayIn();
  const [bill] = await tx
    .update(payables)
    .set({
      status: 'paid',
      paidAt: new Date(),
      paidOn,
      paidMethod: 'bank_transfer',
      paidReference: `RazorpayX ${utr ?? row.providerPayoutId ?? row.id}`,
      paidByUserId: row.requestedByUserId,
      updatedAt: new Date(),
    })
    .where(and(eq(payables.id, row.payableId), eq(payables.status, 'approved')))
    .returning({ name: payables.partyName, projectId: payables.projectId });
  if (!bill) return;
  await postPayablePaid(tx, row.payableId, row.requestedByUserId);
  await postPayoutFee(tx, {
    id: row.id,
    feePaise,
    paidOn,
    label: bill.name,
    projectId: bill.projectId,
  });
  await recordAudit(tx, null, 'payable.paid', 'payable', row.payableId, {
    by: 'razorpayx',
    utr,
    amountPaise: row.amountPaise,
  });
  await notifyHolders(tx, 'finance.record_payments', {
    kind: 'payout_processed',
    title: `${formatInr(row.amountPaise)} reached ${bill.name}`,
    body: `Bank transfer done${utr ? `, UTR ${utr}` : ''}. The bill is marked paid.`,
    dedupeKey: `payout_processed:${row.id}`,
  });
}

/** It did not arrive (or came back): the bill stays to pay; finance decides what next. */
async function warn(tx: Transaction, row: Row, wasPaid: boolean, reason: string | null) {
  const [bill] = await tx
    .select({ name: payables.partyName })
    .from(payables)
    .where(eq(payables.id, row.payableId));
  await notifyHolders(tx, 'finance.approve_payments', {
    kind: 'payout_failed',
    title: wasPaid
      ? `Bank transfer to ${bill?.name ?? 'a payee'} came back`
      : `Bank transfer to ${bill?.name ?? 'a payee'} did not go through`,
    body: `${formatInr(row.amountPaise)}: ${reason ?? 'the bank did not accept it'}.${wasPaid ? ' The bill was marked paid; check it in Finance.' : ' The bill is still to pay.'}`,
    dedupeKey: `payout_failed:${row.id}`,
  });
}
