import { discountTaxPaise, ratesOf } from '@oneohm/domain';
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import {
  journalEntries,
  journalLines,
  milestoneCredits,
  paymentMilestones,
  quotationLines,
} from '../schema';

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

/** The credit/ledger lock of a project: the same one the self-survey discount takes, held to the end of the transaction. */
export const lockProject = (db: DatabaseExecutor, projectId: string) =>
  db.execute(sql`select pg_advisory_xact_lock(hashtext(${`credit:${projectId}`}))`);

/**
 * Whether every other milestone of the project already has its "fell due" entry in the books (this one is the last
 * to be booked). The journal decides, not the due date: milestones released together all have a due date before the
 * first is posted, and only the one posted last may take the GST that is left.
 */
export async function isLastToFall(db: DatabaseExecutor, projectId: string, milestoneId: string) {
  const [open] = await db
    .select({ id: paymentMilestones.id })
    .from(paymentMilestones)
    .where(
      and(
        eq(paymentMilestones.projectId, projectId),
        ne(paymentMilestones.id, milestoneId),
        // A milestone of nothing is never booked and never waited for.
        gt(paymentMilestones.amountPaise, 0),
        sql`not exists (select 1 from ${journalEntries} where ${journalEntries.sourceType} = 'milestone_due' and ${journalEntries.sourceId}::text = ${paymentMilestones.id}::text)`,
      ),
    )
    .limit(1);
  return !open;
}

/** The GST already booked with the project's other milestones when they fell due. */
export async function gstBookedBefore(
  db: DatabaseExecutor,
  projectId: string,
  milestoneId: string,
) {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${journalLines.creditPaise}), 0)` })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalEntries.projectId, projectId),
        eq(journalEntries.sourceType, 'milestone_due'),
        ne(journalEntries.sourceId, milestoneId),
        eq(journalLines.accountCode, '2200'),
      ),
    );
  return Number(row?.total ?? 0);
}
