import { bankPayouts, payables, type Transaction } from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';

/**
 * Stops a manual payment while a bank transfer for the bill is on its way. The bill row
 * is locked first, so two clicks at once cannot both get through.
 */
export async function assertNoOpenPayout(tx: Transaction, payableId: string): Promise<void> {
  await tx
    .select({ id: payables.id })
    .from(payables)
    .where(eq(payables.id, payableId))
    .for('update');
  const [open] = await tx
    .select({ id: bankPayouts.id })
    .from(bankPayouts)
    .where(
      and(
        eq(bankPayouts.payableId, payableId),
        inArray(bankPayouts.status, ['queued', 'pending', 'processing']),
      ),
    )
    .limit(1);
  if (open) {
    throw conflict(
      'A bank transfer for this bill is on its way. Wait for it to finish, or for it to fail, before recording a payment.',
      'payout_open',
    );
  }
}
