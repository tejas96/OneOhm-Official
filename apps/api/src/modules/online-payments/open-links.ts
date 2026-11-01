import type { OpenLink } from '@oneohm/api-contracts';
import { type DatabaseExecutor, paymentLinks } from '@oneohm/database';
import { and, desc, inArray } from 'drizzle-orm';

/** The newest link still open (created or part paid) for each milestone. */
export async function openLinksFor(
  db: DatabaseExecutor,
  milestoneIds: readonly string[],
): Promise<Map<string, NonNullable<OpenLink>>> {
  if (milestoneIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(paymentLinks)
    .where(
      and(
        inArray(paymentLinks.milestoneId, [...milestoneIds]),
        inArray(paymentLinks.status, ['created', 'partly_paid']),
      ),
    )
    .orderBy(desc(paymentLinks.createdAt));
  const open = new Map<string, NonNullable<OpenLink>>();
  for (const row of rows) {
    if (open.has(row.milestoneId)) continue;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) continue;
    open.set(row.milestoneId, {
      id: row.id,
      url: row.url,
      amountPaise: row.amountPaise,
      status: row.status,
      sandbox: row.provider === 'sandbox',
      createdAt: row.createdAt.toISOString(),
    });
  }
  return open;
}
