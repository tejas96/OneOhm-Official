import { bankPayouts, type Database, type Transaction } from '@oneohm/database';
import {
  isPayoutStatus,
  type PayoutStatus,
  payoutDead,
  payoutProblemReason,
  payoutTransition,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { billOf } from './payout-alerts';
import { bookFee, refundFee, reverseSettlement, settle, warnFailed } from './payout-settle';

interface PayoutEntity {
  id?: string;
  reference_id?: string | null;
  status?: string;
  utr?: string | null;
  fees?: number;
  tax?: number;
  failure_reason?: string | null;
  status_details?: { description?: string | null; reason?: string | null } | null;
}

/** A payout already ended without the money arriving (failed, rejected, cancelled, reversed). */
const payoutFailedNow = (status: PayoutStatus): boolean =>
  payoutDead(status) || status === 'reversed';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies a RazorpayX payout event (processed, failed, reversed and the steps between),
 * from a webhook or from our own check. The payout is found by RazorpayX's id, or by our
 * reference when we never saved their id. RazorpayX's later word wins over our guess;
 * out-of-order events are ignored. Each change runs in one transaction with the row locked.
 */
export async function applyPayoutEvent(db: Database, body: unknown): Promise<string> {
  const entity = (body as { payload?: { payout?: { entity?: PayoutEntity } } }).payload?.payout
    ?.entity;
  if (!entity?.id || !entity.status || !isPayoutStatus(entity.status)) return 'ignored';
  const reported = entity.status;
  const entityId = entity.id;
  const [found] = await db
    .select({ id: bankPayouts.id })
    .from(bankPayouts)
    .where(eq(bankPayouts.providerPayoutId, entityId))
    .limit(1);
  const rowId =
    found?.id ??
    (entity.reference_id && UUID.test(entity.reference_id) ? entity.reference_id : null);
  if (!rowId) return 'unknown_payout';
  return db.transaction((tx) => applyToRow(tx, rowId, entity, entityId, reported));
}

/** The locked half of `applyPayoutEvent`: decide, save, then settle, reverse or warn. */
async function applyToRow(
  tx: Transaction,
  rowId: string,
  entity: PayoutEntity,
  entityId: string,
  reported: PayoutStatus,
): Promise<string> {
  const [row] = await tx.select().from(bankPayouts).where(eq(bankPayouts.id, rowId)).for('update');
  if (!row) return 'unknown_payout';
  // A different RazorpayX id on a row that has one is not ours.
  if (row.providerPayoutId && row.providerPayoutId !== entityId) return 'unknown_payout';
  const bill = await billOf(tx, row.payableId);
  const fees = entity.fees ?? 0;
  const tax = fees > 0 ? Math.min(Math.max(entity.tax ?? 0, 0), fees) : 0;
  const decision = payoutTransition(row.status, reported);
  const dead = payoutDead(reported) || reported === 'reversed';
  // The fee is booked once per payout while RazorpayX holds it (any open state, or processed).
  // A payout that ends failed or reversed gets it back, so nothing is booked on that event.
  const endsBad = dead && decision === 'apply';
  if (fees > 0 && !endsBad && !(decision !== 'apply' && payoutFailedNow(row.status)))
    await bookFee(tx, row, bill, fees, tax);
  const base = {
    providerPayoutId: row.providerPayoutId ?? entityId,
    feePaise: fees > 0 ? fees : row.feePaise,
    feeTaxPaise: fees > 0 ? tax : row.feeTaxPaise,
    utr: entity.utr ?? row.utr,
    updatedAt: new Date(),
  };
  if (decision !== 'apply') {
    await tx.update(bankPayouts).set(base).where(eq(bankPayouts.id, row.id));
    return decision;
  }
  // Plain words the owner can act on, never a leftover "processed" message.
  const problem = payoutProblemReason(
    { details: entity.status_details, failureReason: entity.failure_reason },
    reported,
  );
  const reason = dead ? problem.text : null;
  await tx
    .update(bankPayouts)
    .set({
      ...base,
      status: reported,
      failureReason: reason,
      failureCode: dead ? problem.code : null,
    })
    .where(eq(bankPayouts.id, row.id));
  const updated = { ...row, ...base, status: reported as PayoutStatus };
  // Failed, rejected, cancelled or reversed: RazorpayX gives back the fee and its GST.
  if (dead) await refundFee(tx, updated, bill);
  if (reported === 'processed') await settle(tx, updated, bill, base.utr, payoutDead(row.status));
  else if (reported === 'reversed' && row.status === 'processed')
    await reverseSettlement(tx, updated, bill, reason);
  else if (dead) await warnFailed(tx, updated, bill, reason);
  return reported;
}
