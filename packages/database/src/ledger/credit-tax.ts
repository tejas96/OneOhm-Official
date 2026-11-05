import { discountTaxPaise, ratesOf } from '@oneohm/domain';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { milestoneCredits, quotationLines } from '../schema';

/** The GST inside the discounts already taken off this project's instalments (the invoice shows the same). */
export async function creditTaxOf(db: DatabaseExecutor, projectId: string, quotationId: string) {
  const [credit] = await db
    .select({ total: sql<string>`coalesce(sum(${milestoneCredits.amountPaise}), 0)` })
    .from(milestoneCredits)
    .where(and(eq(milestoneCredits.projectId, projectId), eq(milestoneCredits.status, 'applied')));
  const discount = Number(credit?.total ?? 0);
  if (discount <= 0) return 0;
  const lines = await db
    .select()
    .from(quotationLines)
    .where(
      and(
        eq(quotationLines.quotationId, quotationId),
        or(isNull(quotationLines.extraKind), ne(quotationLines.extraKind, 'optional')),
      ),
    );
  return discountTaxPaise(ratesOf(lines), discount);
}
