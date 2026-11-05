import { bankPayouts, type Database } from '@oneohm/database';
import { payoutOpen, payoutStuck } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { billOf, type PayoutRow, tellFinance } from './payout-alerts';
import { NOT_REACHED_TEXT } from './payout-errors';
import { refundFee } from './payout-settle';

/**
 * A payout row with no RazorpayX id that RazorpayX does not know by our reference: the
 * request never arrived. Only then is it safe to call it failed, so the bill can be paid again.
 */
export async function markNotReached(db: Database, rowId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(bankPayouts)
      .where(eq(bankPayouts.id, rowId))
      .for('update');
    if (!row || row.providerPayoutId || !payoutOpen(row.status)) return false;
    await tx
      .update(bankPayouts)
      .set({
        status: 'failed',
        failureReason: NOT_REACHED_TEXT,
        failureCode: 'not_reached',
        updatedAt: new Date(),
      })
      .where(and(eq(bankPayouts.id, row.id), isNull(bankPayouts.providerPayoutId)));
    const bill = await billOf(tx, row.payableId);
    await recordAudit(tx, null, 'payout.send_failed', 'payable', row.payableId, {
      payoutId: row.id,
      code: 'not_reached',
      note: NOT_REACHED_TEXT,
    });
    await tellFinance(tx, bill, {
      kind: 'payout_failed',
      title: `Bank transfer to ${bill.name} did not go through`,
      body: `${formatInr(row.amountPaise)}: ${NOT_REACHED_TEXT}`,
      dedupeKey: `payout_failed:${row.id}`,
    });
    return true;
  });
}

/** Alerts once when a payout has been open longer than it should for its transfer mode. */
export async function alertIfStuck(db: Database, row: PayoutRow, now: Date): Promise<boolean> {
  if (row.stuckAlertedAt || !payoutOpen(row.status) || !payoutStuck(row.mode, row.createdAt, now))
    return false;
  return db.transaction(async (tx) => {
    // Claim the alert first, so two checks at once send it once.
    const claimed = await tx
      .update(bankPayouts)
      .set({ stuckAlertedAt: now })
      .where(and(eq(bankPayouts.id, row.id), isNull(bankPayouts.stuckAlertedAt)))
      .returning({ id: bankPayouts.id });
    if (claimed.length === 0) return false;
    const bill = await billOf(tx, row.payableId);
    await recordAudit(tx, null, 'payout.stuck', 'payable', row.payableId, { payoutId: row.id });
    await tellFinance(tx, bill, {
      kind: 'payout_stuck',
      title: `Bank transfer to ${bill.name} is taking longer than usual`,
      body: `${formatInr(row.amountPaise)} by ${row.mode} has not finished yet. We keep checking with RazorpayX.`,
      dedupeKey: `payout_stuck:${row.id}`,
    });
    return true;
  });
}

export const PRACTICE_CLOSED_TEXT =
  'Practice transfer closed when bank transfers went live. No money moved. You can pay this bill now.';

/**
 * Once transfers are live, a practice transfer still open can never finish, and it would
 * block its bill. Practice never moves money, so it is safe to close it as cancelled.
 */
export async function closePracticeLeftover(db: Database, rowId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(bankPayouts)
      .where(eq(bankPayouts.id, rowId))
      .for('update');
    if (row?.provider !== 'sandbox' || !payoutOpen(row.status)) return false;
    await tx
      .update(bankPayouts)
      .set({
        status: 'cancelled',
        failureReason: PRACTICE_CLOSED_TEXT,
        failureCode: 'practice_closed',
        updatedAt: new Date(),
      })
      .where(eq(bankPayouts.id, row.id));
    await recordAudit(tx, null, 'payout.practice_closed', 'payable', row.payableId, {
      payoutId: row.id,
      amountPaise: row.amountPaise,
    });
    return true;
  });
}

/**
 * Self-repair, run once at start: a payout that failed or came back must not keep a fee as
 * a cost (RazorpayX gives it back). Payouts that ended before that rule existed get their
 * refund posted now. Safe to repeat: each payout is refunded at most once.
 */
export async function refundLeftoverFees(db: Database): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    select b.id from bank_payouts b
     where b.status in ('failed', 'reversed', 'cancelled', 'rejected')
       and exists (select 1 from journal_entries e
                    where e.source_type = 'payout_fee' and e.source_id = b.id::text)
       and not exists (select 1 from journal_entries e
                        where e.source_type = 'payout_fee_refund' and e.source_id = b.id::text)`);
  let fixed = 0;
  for (const { id } of rows.rows) {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(bankPayouts).where(eq(bankPayouts.id, id)).for('update');
      if (!row) return;
      await refundFee(tx, row, await billOf(tx, row.payableId));
      fixed += 1;
    });
  }
  return fixed;
}
