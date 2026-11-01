import { type DatabaseExecutor, leads } from '@oneohm/database';
import { and, desc, eq, notInArray } from 'drizzle-orm';

/**
 * The lead a new quotation belongs to: the one named, else the customer's open lead, so
 * a quotation started from the customer or site still moves the lead to quoted and won.
 */
export async function leadForQuotation(
  db: DatabaseExecutor,
  named: string | null | undefined,
  customerId: string,
): Promise<string | null> {
  if (named) return named;
  const [open] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.customerId, customerId), notInArray(leads.stage, ['won', 'lost'])))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return open?.id ?? null;
}
