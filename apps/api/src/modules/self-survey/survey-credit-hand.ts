import {
  type DatabaseExecutor,
  milestoneCredits,
  paymentMilestones,
  projectActivities,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { liveCreditOf, lock, resolveAlert } from './survey-credit';

type Credit = typeof milestoneCredits.$inferSelect;

/** Finance gave the discount another way (a cheque, cash, a lower final bill): the reason is kept and audited. */
export async function settleByHand(
  tx: DatabaseExecutor,
  given: { readonly creditId: string; readonly userId: string; readonly reason: string },
): Promise<Credit | null> {
  const [found] = await tx
    .select({ projectId: milestoneCredits.projectId })
    .from(milestoneCredits)
    .where(eq(milestoneCredits.id, given.creditId));
  if (!found) return null;
  // The same lock as applying it: a settlement and an automatic application never both give the discount.
  await lock(tx, found.projectId);
  const [credit] = await tx
    .update(milestoneCredits)
    .set({
      status: 'paid_out',
      settledAt: new Date(),
      settledByUserId: given.userId,
      settleNote: given.reason,
    })
    .where(and(eq(milestoneCredits.id, given.creditId), eq(milestoneCredits.status, 'pending')))
    .returning();
  if (!credit) return null;
  await resolveAlert(tx, credit.projectId);
  await tx.insert(projectActivities).values({
    projectId: credit.projectId,
    kind: 'payment',
    message: `${formatInr(credit.amountPaise)} self-survey discount settled by hand: ${given.reason} (book the payout by hand; no ledger entry was made).`,
    userId: given.userId,
  });
  await recordAudit(tx, given.userId, 'milestone_credit.paid_out', 'milestone_credit', credit.id, {
    reason: given.reason,
  });
  return credit;
}

/**
 * The approval is undone: an applied credit goes back on its instalment unless that has fallen due (booked in the
 * ledger at the reduced amount: `locked`, finance adjusts it); a pending one is simply dropped.
 */
export async function reverseCredit(
  tx: DatabaseExecutor,
  given: { readonly projectId: string; readonly userId: string | null; readonly reason: string },
): Promise<
  { readonly kind: 'reversed'; readonly paise: number } | { readonly kind: 'none' | 'locked' }
> {
  await lock(tx, given.projectId);
  const credit = await liveCreditOf(tx, given.projectId);
  if (!credit || credit.status === 'paid_out') return { kind: 'none' };
  if (credit.status === 'applied' && credit.milestoneId) {
    const [milestone] = await tx
      .select()
      .from(paymentMilestones)
      .where(eq(paymentMilestones.id, credit.milestoneId))
      .for('update');
    if (!milestone || milestone.dueAt) return { kind: 'locked' };
    await tx
      .update(paymentMilestones)
      .set({ amountPaise: milestone.amountPaise + credit.amountPaise, updatedAt: new Date() })
      .where(eq(paymentMilestones.id, milestone.id));
  }
  if (credit.status === 'pending') await resolveAlert(tx, credit.projectId);
  await tx
    .update(milestoneCredits)
    .set({
      status: 'reversed',
      reversedAt: new Date(),
      reversedByUserId: given.userId,
      reverseReason: given.reason,
    })
    .where(eq(milestoneCredits.id, credit.id));
  await tx.insert(projectActivities).values({
    projectId: credit.projectId,
    kind: 'payment',
    message: `${formatInr(credit.amountPaise)} self-survey discount taken back: ${given.reason}.`,
    userId: given.userId,
  });
  await recordAudit(tx, given.userId, 'milestone_credit.reversed', 'milestone_credit', credit.id, {
    reason: given.reason,
  });
  return { kind: 'reversed', paise: credit.amountPaise };
}
