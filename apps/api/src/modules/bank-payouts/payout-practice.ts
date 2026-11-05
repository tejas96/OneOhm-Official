import type { BankPayout } from '@oneohm/api-contracts';
import { bankPayouts, payables } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import { applyPayoutEvent } from './payout-events';
import type { PayoutGateway } from './payout-gateway';
import { presentPayout } from './payout-rules';

export type PracticeOutcome = 'processed' | 'failed' | 'reversed';

/** RazorpayX's fee and GST on one payout, the way it shows in a real event (₹5 + 18%). */
export const PRACTICE_FEE_PAISE = 590;
/** The GST inside that fee (18% of ₹5), sent like RazorpayX's `tax`. */
export const PRACTICE_TAX_PAISE = 90;

const PRACTICE_REASON = {
  failed: {
    description: 'Practice: the bank did not accept this transfer.',
    reason: 'practice_failed',
  },
  reversed: {
    description: 'Practice: the bank sent the money back.',
    reason: 'practice_reversed',
  },
} as const;

/** A RazorpayX-shaped payout entity for a practice ending, with a fake UTR when it is paid. */
export function practiceEntity(
  row: { id: string; providerPayoutId: string | null },
  outcome: PracticeOutcome,
): Record<string, unknown> {
  return {
    id: row.providerPayoutId ?? `pout_sandbox_${row.id.replace(/-/g, '').slice(0, 14)}`,
    entity: 'payout',
    reference_id: row.id,
    status: outcome,
    ...(outcome === 'processed'
      ? {
          utr: `PRACTICE${row.id.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
          fees: PRACTICE_FEE_PAISE,
          tax: PRACTICE_TAX_PAISE,
        }
      : { status_details: PRACTICE_REASON[outcome] }),
  };
}

/**
 * Practice mode only: ends a practice payout the way RazorpayX would. It builds a
 * RazorpayX-shaped payout and runs it through `applyPayoutEvent`, the same code as a real
 * webhook, so the bill, ledger, alerts and payee message behave exactly as they will live.
 */
export async function practiceOutcome(
  db: Database,
  gateway: PayoutGateway,
  actor: Actor,
  payoutId: string,
  outcome: PracticeOutcome,
): Promise<BankPayout> {
  if (gateway.mode !== 'sandbox') throw notFound('Practice payouts');
  const [found] = await db
    .select({ payout: bankPayouts, payeeName: payables.partyName })
    .from(bankPayouts)
    .innerJoin(payables, eq(payables.id, bankPayouts.payableId))
    .where(eq(bankPayouts.id, payoutId));
  if (!found) throw notFound('That payout');
  const { payout: row } = found;
  if (row.provider !== 'sandbox')
    throw conflict('This is a real bank transfer, so it cannot be ended by hand.', 'not_practice');
  const open = ['queued', 'pending', 'processing'].includes(row.status);
  if (outcome === 'reversed' && row.status !== 'processed')
    throw conflict('Only a paid transfer can come back. Mark it paid first.', 'not_paid_yet');
  if (outcome !== 'reversed' && !open)
    throw conflict('This practice transfer has already finished.', 'payout_finished');
  await recordAudit(db, actor.userId, 'payout.practice', 'payable', row.payableId, {
    payoutId: row.id,
    outcome,
    note: `Practice: ended as ${outcome}`,
  });
  await applyPayoutEvent(db, { payload: { payout: { entity: practiceEntity(row, outcome) } } });
  const [after] = await db
    .select({ payout: bankPayouts, payeeName: payables.partyName })
    .from(bankPayouts)
    .innerJoin(payables, eq(payables.id, bankPayouts.payableId))
    .where(eq(bankPayouts.id, payoutId));
  if (!after) throw notFound('That payout');
  return presentPayout(after.payout, after.payeeName);
}
