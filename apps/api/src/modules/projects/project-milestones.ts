import { paymentMilestones, postMilestoneDue, type Transaction } from '@oneohm/database';
import { planMilestones } from '@oneohm/domain';
import { planSteps } from '../payment-plans/payment-plans.service';

/**
 * The project's payment schedule from its plan (PRD 3.11, Flow A step 9). Milestones due
 * from day one (the advance) are booked in the ledger with the project.
 */
export async function activateMilestones(
  tx: Transaction,
  projectId: string,
  plan: {
    readonly totalPaise: number;
    readonly paymentPlanId: string | null | undefined;
    readonly loanPaise: number;
  },
  userId: string,
): Promise<void> {
  const milestones = planMilestones(
    plan.totalPaise,
    await planSteps(tx, plan.paymentPlanId),
    plan.loanPaise,
  );
  const created = await tx
    .insert(paymentMilestones)
    .values(
      milestones.map((milestone, position) => ({
        projectId,
        key: milestone.key,
        label: milestone.label,
        payer: milestone.payer,
        amountPaise: milestone.amountPaise,
        trigger: milestone.trigger,
        status:
          milestone.trigger === 'quotation_accepted' ? ('due' as const) : ('upcoming' as const),
        dueAt: milestone.trigger === 'quotation_accepted' ? new Date() : null,
        position,
      })),
    )
    .returning({ id: paymentMilestones.id, dueAt: paymentMilestones.dueAt });
  for (const milestone of created) {
    if (milestone.dueAt) await postMilestoneDue(tx, milestone.id, userId);
  }
}
