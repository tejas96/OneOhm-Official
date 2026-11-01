import { type DatabaseExecutor, paymentMilestones, projects } from '@oneohm/database';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';

/**
 * Financial closure is its own event (PRD 3.7, 3.11): the work is complete and every
 * milestone is paid. Called when either happens, so whichever comes last closes it.
 */
export async function closeIfSettled(db: DatabaseExecutor, projectId: string): Promise<boolean> {
  const [unpaid] = await db
    .select({ id: paymentMilestones.id })
    .from(paymentMilestones)
    .where(and(eq(paymentMilestones.projectId, projectId), ne(paymentMilestones.status, 'paid')))
    .limit(1);
  if (unpaid) return false;
  const closed = await db
    .update(projects)
    .set({ financiallyClosedAt: sql`now()`, updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.status, 'completed'),
        isNull(projects.financiallyClosedAt),
      ),
    )
    .returning({ id: projects.id });
  return closed.length > 0;
}
