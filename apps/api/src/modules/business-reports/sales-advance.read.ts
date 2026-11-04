import { type DatabaseExecutor, paymentMilestones, projects, quotations } from '@oneohm/database';
import { and, eq, inArray, sql } from 'drizzle-orm';

/**
 * The leads among these whose project has its first customer milestone (the advance) paid.
 * A project's bank milestones are not the advance; the first customer one by position is.
 */
export async function readAdvancePaidLeadIds(
  db: DatabaseExecutor,
  leadIds: readonly string[],
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ leadId: quotations.leadId })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(
      and(
        inArray(quotations.leadId, [...leadIds]),
        eq(paymentMilestones.payer, 'customer'),
        eq(paymentMilestones.status, 'paid'),
        sql`${paymentMilestones.position} = (
          select min(first.position) from payment_milestones first
           where first.project_id = ${paymentMilestones.projectId} and first.payer = 'customer'
        )`,
      ),
    );
  return new Set(rows.flatMap((row) => (row.leadId ? [row.leadId] : [])));
}
