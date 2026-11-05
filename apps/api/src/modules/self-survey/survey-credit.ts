import {
  type DatabaseExecutor,
  milestoneCredits,
  paymentMilestones,
  projectActivities,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';

const SOURCE = 'self_survey';

export type CreditResult =
  | { readonly kind: 'applied'; readonly id: string; readonly label: string }
  /** Applied before for this approval: nothing changes. */
  | { readonly kind: 'already'; readonly id: string }
  /** No instalment is still upcoming to take it (all fell due or are paid). */
  | { readonly kind: 'none' };

/** The live credit an approval gave, if any. */
async function liveCredit(tx: DatabaseExecutor, actionId: string) {
  const [row] = await tx
    .select()
    .from(milestoneCredits)
    .where(
      and(
        eq(milestoneCredits.source, SOURCE),
        eq(milestoneCredits.sourceId, actionId),
        isNull(milestoneCredits.reversedAt),
      ),
    );
  return row ?? null;
}

/**
 * Takes the self-survey discount off the next customer instalment that has not fallen due yet, so the
 * books show the reduced amount when it falls due (an instalment already due is booked and is not touched).
 * One live credit per approval: the second call finds the first and changes nothing. The instalment keeps
 * at least one rupee. Runs in the approval's transaction; audited and logged.
 */
export async function applyCredit(
  tx: DatabaseExecutor,
  given: {
    readonly projectId: string;
    readonly actionId: string;
    readonly amountPaise: number;
    readonly userId: string | null;
  },
): Promise<CreditResult> {
  // One approval at a time per project (the instalments are locked below as well).
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`credit:${given.actionId}`}))`);
  const earlier = await liveCredit(tx, given.actionId);
  if (earlier) return { kind: 'already', id: earlier.id };
  if (given.amountPaise <= 0) return { kind: 'none' };
  const upcoming = await tx
    .select()
    .from(paymentMilestones)
    .where(
      and(
        eq(paymentMilestones.projectId, given.projectId),
        eq(paymentMilestones.payer, 'customer'),
        eq(paymentMilestones.status, 'upcoming'),
        isNull(paymentMilestones.dueAt),
      ),
    )
    .orderBy(asc(paymentMilestones.position))
    .for('update');
  const next = upcoming.find((one) => one.amountPaise > given.amountPaise);
  if (!next) return { kind: 'none' };
  const [credit] = await tx
    .insert(milestoneCredits)
    .values({
      projectId: given.projectId,
      milestoneId: next.id,
      amountPaise: given.amountPaise,
      source: SOURCE,
      sourceId: given.actionId,
      appliedByUserId: given.userId,
    })
    .returning({ id: milestoneCredits.id });
  if (!credit) throw new Error('Credit insert returned nothing');
  await tx
    .update(paymentMilestones)
    .set({ amountPaise: next.amountPaise - given.amountPaise, updatedAt: new Date() })
    .where(eq(paymentMilestones.id, next.id));
  const what = `${formatInr(given.amountPaise)} self-survey discount taken off ${next.label}`;
  await tx.insert(projectActivities).values({
    projectId: given.projectId,
    kind: 'payment',
    message: `${what} (now ${formatInr(next.amountPaise - given.amountPaise)}).`,
    userId: given.userId,
  });
  await recordAudit(tx, given.userId, 'milestone_credit.applied', 'milestone_credit', credit.id, {
    actionId: given.actionId,
    milestoneId: next.id,
    amountPaise: given.amountPaise,
  });
  return { kind: 'applied', id: credit.id, label: next.label };
}

/**
 * The approval is undone: the amount goes back on the instalment while it is still upcoming. Once it fell due
 * (booked in the ledger at the reduced amount) it is `locked` and finance must adjust it by hand.
 */
export async function reverseCredit(
  tx: DatabaseExecutor,
  given: { readonly actionId: string; readonly userId: string | null; readonly reason: string },
): Promise<'reversed' | 'none' | 'locked'> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`credit:${given.actionId}`}))`);
  const credit = await liveCredit(tx, given.actionId);
  if (!credit) return 'none';
  const [milestone] = await tx
    .select()
    .from(paymentMilestones)
    .where(eq(paymentMilestones.id, credit.milestoneId))
    .for('update');
  if (milestone?.status !== 'upcoming' || milestone.dueAt) return 'locked';
  await tx
    .update(paymentMilestones)
    .set({ amountPaise: milestone.amountPaise + credit.amountPaise, updatedAt: new Date() })
    .where(eq(paymentMilestones.id, milestone.id));
  await tx
    .update(milestoneCredits)
    .set({ reversedAt: new Date(), reversedByUserId: given.userId, reverseReason: given.reason })
    .where(eq(milestoneCredits.id, credit.id));
  await tx.insert(projectActivities).values({
    projectId: credit.projectId,
    kind: 'payment',
    message: `${formatInr(credit.amountPaise)} self-survey discount put back on ${milestone.label}: ${given.reason}.`,
    userId: given.userId,
  });
  await recordAudit(tx, given.userId, 'milestone_credit.reversed', 'milestone_credit', credit.id, {
    actionId: given.actionId,
    reason: given.reason,
  });
  return 'reversed';
}
