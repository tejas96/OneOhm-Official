import { type DatabaseExecutor, paymentLinks } from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import type { PaymentGateway } from './gateway';

/**
 * After a payment by other means, open links on the milestone are cancelled (at the
 * gateway too), so the customer cannot pay twice. Finance can send a fresh link.
 */
export async function closeOpenLinks(
  db: DatabaseExecutor,
  gateway: PaymentGateway,
  milestoneId: string,
): Promise<number> {
  const open = await db
    .select({ id: paymentLinks.id, providerLinkId: paymentLinks.providerLinkId })
    .from(paymentLinks)
    .where(
      and(
        eq(paymentLinks.milestoneId, milestoneId),
        inArray(paymentLinks.status, ['created', 'partly_paid']),
      ),
    );
  for (const link of open) {
    try {
      await gateway.cancel(link.providerLinkId);
    } catch {
      // Already paid, expired or unreachable: the webhook settles any late payment.
    }
    await db
      .update(paymentLinks)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentLinks.id, link.id));
  }
  return open.length;
}
