import {
  notifyHolders,
  paymentMilestones,
  projectActivities,
  projects,
  quotations,
  type Transaction,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, desc, eq } from 'drizzle-orm';

/**
 * A survey revision the customer accepted (Flow A step 6): the project moves to it and
 * the budget locks. The price difference goes on the final customer payment while that
 * is still upcoming (nothing is booked for it yet); otherwise finance is asked to settle it.
 */
export async function applyAcceptedRevision(
  tx: Transaction,
  quotationId: string,
  newTotalPaise: number,
  userId: string,
): Promise<void> {
  const [project] = await tx
    .select({ id: projects.id, code: projects.code, oldTotal: quotations.totalPaise })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(eq(projects.revisionQuotationId, quotationId))
    .limit(1);
  if (!project) return;
  const difference = newTotalPaise - project.oldTotal;
  await tx
    .update(projects)
    .set({
      quotationId,
      budgetStatus: 'revised',
      budgetLockedAt: new Date(),
      revisionQuotationId: null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));
  const [last] = await tx
    .select({
      id: paymentMilestones.id,
      amount: paymentMilestones.amountPaise,
      status: paymentMilestones.status,
      label: paymentMilestones.label,
    })
    .from(paymentMilestones)
    .where(
      and(eq(paymentMilestones.projectId, project.id), eq(paymentMilestones.payer, 'customer')),
    )
    .orderBy(desc(paymentMilestones.position))
    .limit(1);
  const fits = last?.status === 'upcoming' && last.amount + difference > 0;
  if (difference !== 0 && last && fits)
    await tx
      .update(paymentMilestones)
      .set({ amountPaise: last.amount + difference, updatedAt: new Date() })
      .where(eq(paymentMilestones.id, last.id));
  if (difference !== 0 && !fits)
    await notifyHolders(tx, 'finance.record_payments', {
      kind: 'schedule_adjust',
      title: `Adjust the payment schedule on ${project.code}`,
      body: `The accepted revision changed the price by ${formatInr(difference)}; the final payment could not absorb it.`,
      subject: { type: 'project', id: project.id, projectId: project.id },
      dedupeKey: `schedule_adjust:${quotationId}`,
    });
  await tx.insert(projectActivities).values({
    projectId: project.id,
    kind: 'budget',
    message:
      difference === 0
        ? 'Customer accepted the survey revision. Budget locked.'
        : `Customer accepted the survey revision (${formatInr(difference)}). Budget locked${fits && last ? `; ${last.label} is now ${formatInr(last.amount + difference)}` : ''}.`,
    userId,
  });
}
