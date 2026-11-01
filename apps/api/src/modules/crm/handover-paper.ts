import { type DatabaseExecutor, payments } from '@oneohm/database';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';

const UUID = '[0-9a-f-]{36}';

/**
 * The paper behind an in-person update, for the team to print and hand over: the
 * quotation that was sent, or the receipt for the payment that came in.
 */
export async function paperFor(
  db: DatabaseExecutor,
  template: string,
  dedupeKey: string,
): Promise<string | null> {
  if (template === 'quotation_sent') {
    const id = new RegExp(`^quotation_sent:(${UUID})`).exec(dedupeKey)?.[1];
    return id ? `/api/v1/quotations/${id}/pdf` : null;
  }
  if (template === 'payment_received') {
    const milestoneId = new RegExp(`^payment:(${UUID}):`).exec(dedupeKey)?.[1];
    if (!milestoneId) return null;
    const [payment] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.milestoneId, milestoneId),
          gt(payments.amountPaise, 0),
          isNull(payments.reversesPaymentId),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);
    return payment ? `/api/v1/finance/payments/${payment.id}/receipt` : null;
  }
  return null;
}
