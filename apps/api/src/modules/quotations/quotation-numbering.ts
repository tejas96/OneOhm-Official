import { quotations, type Transaction } from '@oneohm/database';
import { and, eq, inArray, like, sql } from 'drizzle-orm';

export interface RevisionOf {
  readonly id: string;
  readonly number: string;
  readonly revision: number;
}

/**
 * The number and revision for a new quotation. A new quote on a site with an open one
 * replaces it as the next revision; a revision of an accepted quote (after the survey)
 * keeps its number. Otherwise a fresh number for the year, e.g. OH-Q-2026-0004.
 */
export async function numberFor(
  tx: Transaction,
  propertyId: string,
  today: string,
  revisionOf?: RevisionOf,
): Promise<{ number: string; revision: number; previousId: string | null }> {
  if (revisionOf)
    return {
      number: revisionOf.number,
      revision: revisionOf.revision + 1,
      previousId: revisionOf.id,
    };
  const [previous] = await tx
    .select({ id: quotations.id, number: quotations.number, revision: quotations.revision })
    .from(quotations)
    .where(
      and(eq(quotations.propertyId, propertyId), inArray(quotations.status, ['draft', 'sent'])),
    )
    .orderBy(sql`${quotations.revision} desc`)
    .limit(1);
  if (previous) {
    await tx
      .update(quotations)
      .set({ status: 'superseded', updatedAt: new Date() })
      .where(eq(quotations.id, previous.id));
    return { number: previous.number, revision: previous.revision + 1, previousId: previous.id };
  }
  const prefix = `OH-Q-${today.slice(0, 4)}-`;
  const [row] = await tx
    .select({ count: sql<number>`count(distinct ${quotations.number})::int` })
    .from(quotations)
    .where(like(quotations.number, `${prefix}%`));
  return {
    number: `${prefix}${String((row?.count ?? 0) + 1).padStart(4, '0')}`,
    revision: 1,
    previousId: null,
  };
}
