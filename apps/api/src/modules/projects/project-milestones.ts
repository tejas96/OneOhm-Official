import { paymentMilestones, postMilestoneDue, type Transaction } from '@oneohm/database';
import { planMilestones } from '@oneohm/domain';
import { tellCustomerMilestonesDue } from '../online-payments/milestone-due-notice';
import { planSteps } from '../payment-plans/payment-plans.service';
import { quotedSteps } from '../quotations/quoted-terms';

/**
 * The project's payment schedule from its plan (PRD 3.11, Flow A step 9). Milestones due
 * from day one (the advance) are booked in the ledger with the project.
 */
export async function activateMilestones(
  tx: Transaction,
  projectId: string,
  plan: {
    readonly totalPaise: number;
    /** Another plan someone picked; none means the terms in the quotation. */
    readonly paymentPlanId: string | null | undefined;
    readonly quotationId: string;
    readonly loanPaise: number;
  },
  userId: string,
): Promise<void> {
  const milestones = planMilestones(
    plan.totalPaise,
    plan.paymentPlanId
      ? await planSteps(tx, plan.paymentPlanId)
      : await quotedSteps(tx, plan.quotationId),
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
  const due = created.filter((milestone) => milestone.dueAt);
  for (const milestone of due) await postMilestoneDue(tx, milestone.id, userId);
  // The customer hears about the advance now, with a Pay now button.
  await tellCustomerMilestonesDue(
    tx,
    due.map((milestone) => milestone.id),
  );
}
