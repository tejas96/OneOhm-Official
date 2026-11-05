import {
  type DatabaseExecutor,
  milestoneCredits,
  notifyHolders,
  paymentMilestones,
  projectActivities,
  projects,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';

const SOURCE = 'self_survey';
type Credit = typeof milestoneCredits.$inferSelect;

export type CreditResult =
  /** Taken off an instalment that had not fallen due. */
  | { readonly kind: 'applied'; readonly id: string; readonly label: string }
  /** No instalment could take it: finance was told and settles it (or it is applied later). */
  | { readonly kind: 'pending'; readonly id: string }
  /** The project already earned it (one discount per project): nothing changes. */
  | { readonly kind: 'already'; readonly id: string };

/** One earner at a time per project: the lock is the project's, the unique index backs it up. */
const lock = (tx: DatabaseExecutor, projectId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`credit:${projectId}`}))`);

/** The live (not reversed) self-survey credit of a project, if any. */
export async function liveCreditOf(tx: DatabaseExecutor, projectId: string) {
  const [row] = await tx
    .select()
    .from(milestoneCredits)
    .where(
      and(
        eq(milestoneCredits.projectId, projectId),
        eq(milestoneCredits.source, SOURCE),
        ne(milestoneCredits.status, 'reversed'),
      ),
    );
  return row ?? null;
}

/**
 * Takes a pending credit off the first customer instalment that has not fallen due and has room for it
 * (the instalment keeps at least one rupee). The books then show the reduced amount when it falls due.
 */
async function place(tx: DatabaseExecutor, credit: Credit, userId: string | null) {
  const upcoming = await tx
    .select()
    .from(paymentMilestones)
    .where(
      and(
        eq(paymentMilestones.projectId, credit.projectId),
        eq(paymentMilestones.payer, 'customer'),
        eq(paymentMilestones.status, 'upcoming'),
        isNull(paymentMilestones.dueAt),
      ),
    )
    .orderBy(asc(paymentMilestones.position))
    .for('update');
  const next = upcoming.find((one) => one.amountPaise > credit.amountPaise);
  if (!next) return null;
  await tx
    .update(paymentMilestones)
    .set({ amountPaise: next.amountPaise - credit.amountPaise, updatedAt: new Date() })
    .where(eq(paymentMilestones.id, next.id));
  await tx
    .update(milestoneCredits)
    .set({ status: 'applied', milestoneId: next.id, appliedByUserId: userId })
    .where(eq(milestoneCredits.id, credit.id));
  await tx.insert(projectActivities).values({
    projectId: credit.projectId,
    kind: 'payment',
    message: `${formatInr(credit.amountPaise)} self-survey discount taken off ${next.label} (now ${formatInr(next.amountPaise - credit.amountPaise)}).`,
    userId,
  });
  await recordAudit(tx, userId, 'milestone_credit.applied', 'milestone_credit', credit.id, {
    actionId: credit.sourceId,
    milestoneId: next.id,
    amountPaise: credit.amountPaise,
  });
  return next;
}

/**
 * The survey was approved: the project earns its discount, once. It is taken off the next customer instalment that
 * has not fallen due; if none can take it the credit waits as `pending`, the finance desk is told (like a price
 * difference the final payment cannot absorb) and nothing is lost. Runs in the approval's transaction.
 */
export async function applyCredit(
  tx: DatabaseExecutor,
  given: {
    readonly projectId: string;
    readonly actionId: string;
    readonly amountPaise: number;
    readonly userId: string | null;
  },
): Promise<CreditResult | null> {
  if (given.amountPaise <= 0) return null;
  await lock(tx, given.projectId);
  const earlier = await liveCreditOf(tx, given.projectId);
  if (earlier) return { kind: 'already', id: earlier.id };
  const [credit] = await tx
    .insert(milestoneCredits)
    .values({
      projectId: given.projectId,
      status: 'pending',
      amountPaise: given.amountPaise,
      source: SOURCE,
      sourceId: given.actionId,
      appliedByUserId: given.userId,
    })
    .returning();
  if (!credit) throw new Error('Credit insert returned nothing');
  const next = await place(tx, credit, given.userId);
  if (next) return { kind: 'applied', id: credit.id, label: next.label };
  const [project] = await tx
    .select({ code: projects.code })
    .from(projects)
    .where(eq(projects.id, given.projectId));
  await notifyHolders(tx, 'finance.record_payments', {
    kind: 'credit_pending',
    title: `Give the ${formatInr(given.amountPaise)} self-survey discount on ${project?.code ?? 'the project'}`,
    body: 'No payment that has not fallen due can take it. It is applied by itself if one can later; otherwise settle it by hand on the project payments.',
    subject: { type: 'project', id: given.projectId, projectId: given.projectId },
    dedupeKey: `credit_pending:${given.projectId}`,
  });
  await tx.insert(projectActivities).values({
    projectId: given.projectId,
    kind: 'payment',
    message: `${formatInr(given.amountPaise)} self-survey discount is pending: no upcoming payment could take it. Finance was told.`,
    userId: given.userId,
  });
  await recordAudit(tx, given.userId, 'milestone_credit.pending', 'milestone_credit', credit.id, {
    actionId: given.actionId,
    amountPaise: given.amountPaise,
  });
  return { kind: 'pending', id: credit.id };
}

/**
 * A payment became upcoming with room (a revision or change accepted) or is about to fall due: a pending credit
 * is taken off it now. Runs in the caller's transaction; true when one was applied.
 */
export async function applyPendingCredit(
  tx: DatabaseExecutor,
  projectId: string,
  userId: string | null,
): Promise<boolean> {
  await lock(tx, projectId);
  const [credit] = await tx
    .select()
    .from(milestoneCredits)
    .where(
      and(
        eq(milestoneCredits.projectId, projectId),
        eq(milestoneCredits.source, SOURCE),
        eq(milestoneCredits.status, 'pending'),
      ),
    );
  return credit ? (await place(tx, credit, userId)) !== null : false;
}

/** Finance gave the discount another way (a cheque, cash, a lower final bill): the reason is kept and audited. */
export async function settleByHand(
  tx: DatabaseExecutor,
  given: { readonly creditId: string; readonly userId: string; readonly reason: string },
): Promise<Credit | null> {
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
  await tx.insert(projectActivities).values({
    projectId: credit.projectId,
    kind: 'payment',
    message: `${formatInr(credit.amountPaise)} self-survey discount settled by hand: ${given.reason}`,
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
