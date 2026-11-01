import type { PaymentLink } from '@oneohm/api-contracts';
import type { paymentLinks } from '@oneohm/database';

export function presentLink(row: typeof paymentLinks.$inferSelect): PaymentLink {
  return {
    id: row.id,
    milestoneId: row.milestoneId,
    projectId: row.projectId,
    url: row.url,
    amountPaise: row.amountPaise,
    paidPaise: row.paidPaise,
    status: row.status,
    sandbox: row.provider === 'sandbox',
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}
