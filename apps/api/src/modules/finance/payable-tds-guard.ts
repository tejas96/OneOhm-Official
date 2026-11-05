import { payables, type Transaction, workOrderAdvances, workOrders } from '@oneohm/database';
import { eq, or } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';

/**
 * Staff payments carry no TDS, and a work order's TDS is held when it settles (its
 * bills are already net), so TDS is set here only on other vendor and crew bills.
 */
export async function assertTdsHere(tx: Transaction, bill: typeof payables.$inferSelect) {
  if (bill.party === 'employee') {
    throw invalid('Staff payments carry no TDS.', { tdsBp: 'Leave at 0.' });
  }
  const [order] = await tx
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(or(eq(workOrders.payableId, bill.id), eq(workOrders.retentionPayableId, bill.id)))
    .limit(1);
  const [advance] = await tx
    .select({ id: workOrderAdvances.id })
    .from(workOrderAdvances)
    .where(eq(workOrderAdvances.payableId, bill.id))
    .limit(1);
  if (order || advance) {
    throw invalid('TDS on a work order is held when the work order settles.', {
      tdsBp: 'Already worked out on the work order.',
    });
  }
}
