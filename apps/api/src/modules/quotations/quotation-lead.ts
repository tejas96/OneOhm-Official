import { type DatabaseExecutor, leads } from '@oneohm/database';
import { and, desc, eq, isNull, notInArray, or } from 'drizzle-orm';

/**
 * The lead a new quotation belongs to: the one named, else the customer's open lead for
 * this site (or one with no site yet), so a quotation started from the customer or site
 * still moves the lead to quoted and won. A lead for another of their sites is left alone.
 */
export async function leadForQuotation(
  db: DatabaseExecutor,
  named: string | null | undefined,
  customerId: string,
  propertyId: string,
): Promise<string | null> {
  if (named) return named;
  const open = await db
    .select({ id: leads.id, propertyId: leads.propertyId })
    .from(leads)
    .where(
      and(
        eq(leads.customerId, customerId),
        notInArray(leads.stage, ['won', 'lost']),
        or(eq(leads.propertyId, propertyId), isNull(leads.propertyId)),
      ),
    )
    .orderBy(desc(leads.createdAt));
  const sameSite = open.find((lead) => lead.propertyId === propertyId);
  return (sameSite ?? open[0])?.id ?? null;
}
