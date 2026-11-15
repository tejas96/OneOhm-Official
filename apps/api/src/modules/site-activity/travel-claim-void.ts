import {
  bankPayouts,
  notify,
  notifyHolders,
  payables,
  payoutRequests,
  reversePayableApproved,
  type Transaction,
  travelClaims,
} from '@oneohm/database';
import { PAYOUT_FAILED_STATUSES, travelVoidProblem } from '@oneohm/domain';
import { and, eq, notInArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { TRAVEL_NOTICES } from './travel-claim-notices';
import { assertMayVoidClaim } from './travel-claim-people';

const WHY = {
  reason: 'Say why the claim is voided.',
  not_approved: 'Only an approved claim can be voided.',
  paid: 'This claim is already paid, so it cannot be voided.',
  payout_open:
    'A bank transfer was started for this claim, so it cannot be voided. If it fails, void it then.',
} as const;

/**
 * Voids an approved claim nobody has paid (S9), in the caller's transaction: the bill is
 * cancelled, its ledger entry gets an equal and opposite entry (never deleted), the claim
 * becomes cancelled with the reason, the worker and finance are told, and it is audited.
 * Only finance or HR may void. Refused once paid or while any bank transfer that has not failed
 * exists (the bill row is locked, as the sender locks it, so the two cannot race). Open asks to
 * send the bill are closed. The day can be claimed again,
 * because the one-claim-per-day rule counts only pending and approved claims.
 */
export async function voidClaim(
  tx: Transaction,
  actor: Actor,
  id: string,
  reasonText: string,
): Promise<void> {
  const reason = reasonText.trim();
  if (!reason) throw invalid(WHY.reason, { reason: 'Required.' });
  const [claim] = await tx
    .select()
    .from(travelClaims)
    .where(eq(travelClaims.id, id))
    .for('update')
    .limit(1);
  if (!claim) throw notFound('That travel claim');
  assertMayVoidClaim(actor, claim.userId);
  // The bill is locked next, so a payment or transfer cannot slip in while this runs.
  const [bill] = claim.payableId
    ? await tx.select().from(payables).where(eq(payables.id, claim.payableId)).for('update')
    : [];
  const [open] = claim.payableId
    ? await tx
        .select({ id: bankPayouts.id })
        .from(bankPayouts)
        .where(
          and(
            eq(bankPayouts.payableId, claim.payableId),
            // Any transfer that did not fail (on its way or paid) blocks the void.
            notInArray(bankPayouts.status, [...PAYOUT_FAILED_STATUSES]),
          ),
        )
        .limit(1)
    : [];
  const problem = travelVoidProblem({
    status: claim.status,
    payableStatus: bill?.status ?? null,
    payoutOpen: Boolean(open),
    reason,
  });
  if (problem) throw conflict(WHY[problem], problem === 'paid' ? 'paid' : problem);
  if (!bill) throw conflict('This claim has no bill to cancel.', 'no_bill');
  // Part-paid by hand counts as paid money: it must be undone first.
  if (bill.paidPaise > 0) throw conflict(WHY.paid, 'paid');
  const now = new Date();
  // An open ask to send this bill is answered: the bill no longer exists to pay.
  await tx
    .update(payoutRequests)
    .set({
      status: 'declined',
      decidedByUserId: actor.userId,
      decidedAt: now,
      decisionNote: 'The travel claim was voided.',
    })
    .where(and(eq(payoutRequests.payableId, bill.id), eq(payoutRequests.status, 'open')));
  await tx
    .update(payables)
    .set({ status: 'cancelled', updatedAt: now })
    .where(eq(payables.id, bill.id));
  const reversed = await reversePayableApproved(
    tx,
    bill.id,
    actor.userId,
    `Travel claim voided: ${reason}`,
  );
  await tx
    .update(travelClaims)
    .set({
      status: 'cancelled',
      voidedAt: now,
      voidedByUserId: actor.userId,
      voidReason: reason,
      updatedAt: now,
    })
    .where(eq(travelClaims.id, id));
  await notify(
    tx,
    { userId: claim.userId },
    TRAVEL_NOTICES.voided(id, claim.workDate, claim.amountPaise, reason),
  );
  await notifyHolders(
    tx,
    'finance.record_payments',
    TRAVEL_NOTICES.billVoided(
      bill.id,
      claim.projectId,
      bill.partyName,
      claim.workDate,
      claim.amountPaise,
    ),
    actor.userId,
  );
  await recordAudit(tx, actor.userId, 'travel_claim.voided', 'travel_claim', id, {
    amountPaise: claim.amountPaise,
    payableId: bill.id,
    reason,
    ledgerReversed: reversed !== null,
  });
}
