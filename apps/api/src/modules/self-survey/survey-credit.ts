import {
  type DatabaseExecutor,
  milestoneCredits,
  notifications,
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
  | {
      readonly kind: 'applied';
      readonly id: string;
      readonly label: string;
      readonly trigger: string;
    }
  /** No instalment could take it: finance was told and settles it (or it is applied later). */
  | { readonly kind: 'pending'; readonly id: string }
  /** The project already earned it (one discount per project): nothing changes. */
  | { readonly kind: 'already'; readonly id: string };

/** One earner at a time per project: the lock is the project's, the unique index backs it up. */
export const lock = (tx: DatabaseExecutor, projectId: string) =>
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

/** The finance alert is done with once the credit is applied or settled: it is marked read. */
export async function resolveAlert(tx: DatabaseExecutor, projectId: string) {
  await tx
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.kind, 'credit_pending'),
        eq(notifications.projectId, projectId),
        isNull(notifications.readAt),
      ),
    );
}

/**
 * Takes a pending credit off the first customer instalment that has not fallen due and can lose it while keeping at
 * least one rupee (100 paise). The credit is claimed first (`where status = 'pending'`): if another settlement or
 * application got there first nothing is touched, so a discount is never given twice. The books then show the
 * reduced amount when the instalment falls due. Runs under the project's credit lock.
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
  const next = upcoming.find((one) => one.amountPaise - credit.amountPaise >= 100);
  if (!next) return null;
  const [claimed] = await tx
    .update(milestoneCredits)
    .set({ status: 'applied', milestoneId: next.id, appliedByUserId: userId })
    .where(and(eq(milestoneCredits.id, credit.id), eq(milestoneCredits.status, 'pending')))
    .returning({ id: milestoneCredits.id });
  if (!claimed) return null;
  await tx
    .update(paymentMilestones)
    .set({ amountPaise: next.amountPaise - credit.amountPaise, updatedAt: new Date() })
    .where(eq(paymentMilestones.id, next.id));
  await resolveAlert(tx, credit.projectId);
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
  if (next) return { kind: 'applied', id: credit.id, label: next.label, trigger: next.trigger };
  const [project] = await tx
    .select({ code: projects.code })
    .from(projects)
    .where(eq(projects.id, given.projectId));
  await notifyHolders(tx, 'finance.record_payments', {
    kind: 'credit_pending',
    title: `Give the ${formatInr(given.amountPaise)} self-survey discount on ${project?.code ?? 'the project'}`,
    body: 'No payment that has not fallen due can take it. It is applied by itself if one can later. If you mark it paid out instead, the payout must be booked by hand: no ledger entry is made.',
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
    )
    .for('update');
  return credit ? (await place(tx, credit, userId)) !== null : false;
}
