import {
  ACCOUNT,
  advanceAppliedPosting,
  allocateTax,
  type LedgerAccountCode,
  milestoneDuePosting,
  paymentPosting,
  reversalPosting,
} from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import {
  customers,
  journalEntries,
  journalLines,
  paymentMilestones,
  payments,
  projects,
  quotations,
} from '../schema';
import { postJournal } from './post-journal';

/** Calendar date in India for an instant. */
export const businessDate = (at: Date) => todayIn('Asia/Kolkata', at);

/**
 * A milestone fell due: the payer owes it (receivable, revenue and its GST share).
 * Money already received against it as an advance is then set against it.
 */
export async function postMilestoneDue(
  db: DatabaseExecutor,
  milestoneId: string,
  userId: string | null,
): Promise<void> {
  const [row] = await db
    .select({
      milestone: paymentMilestones,
      code: projects.code,
      taxPaise: quotations.taxPaise,
    })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(eq(paymentMilestones.id, milestoneId))
    .limit(1);
  if (!row?.milestone.dueAt) return;
  const { milestone } = row;
  const dueAt = milestone.dueAt as Date;
  const siblings = await db
    .select({ id: paymentMilestones.id, amountPaise: paymentMilestones.amountPaise })
    .from(paymentMilestones)
    .where(eq(paymentMilestones.projectId, milestone.projectId))
    .orderBy(asc(paymentMilestones.position));
  const taxes = allocateTax(
    siblings.map((sibling) => sibling.amountPaise),
    row.taxPaise,
  );
  const gstPaise = taxes[siblings.findIndex((sibling) => sibling.id === milestone.id)] ?? 0;
  const base = { projectId: milestone.projectId, postedByUserId: userId };
  await postJournal(db, {
    ...base,
    entryDate: businessDate(dueAt),
    memo: `${row.code} · ${milestone.label} fell due (${milestone.payer === 'bank' ? 'bank' : 'customer'})`,
    sourceType: 'milestone_due',
    sourceId: milestone.id,
    lines: milestoneDuePosting({
      payer: milestone.payer,
      amountPaise: milestone.amountPaise,
      gstPaise,
    }),
  });
  const [advance] = await db
    .select({ total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.milestoneId, milestone.id),
        // In SQL, so microsecond timestamps are compared as stored.
        sql`${payments.createdAt} < (select m.due_at from payment_milestones m where m.id = ${milestone.id})`,
      ),
    );
  const advancePaise = Number(advance?.total ?? 0);
  if (advancePaise > 0) {
    await postJournal(db, {
      ...base,
      entryDate: businessDate(dueAt),
      memo: `${row.code} · ${formatInr(advancePaise)} advance set against ${milestone.label}`,
      sourceType: 'advance_applied',
      sourceId: milestone.id,
      lines: advanceAppliedPosting({ payer: milestone.payer, amountPaise: advancePaise }),
    });
  }
}

/**
 * Money received. Against a milestone that is already due it settles the receivable;
 * before then it is held as an advance. A reversal row undoes its original's entry.
 * A row paid from credit draws on customer credit; a negative row that reverses
 * nothing is a refund's release, which its refund posts (`postCustomerRefund`).
 */
export async function postPayment(
  db: DatabaseExecutor,
  paymentId: string,
  userId: string | null,
): Promise<void> {
  const [row] = await db
    .select({
      payment: payments,
      dueAt: paymentMilestones.dueAt,
      label: paymentMilestones.label,
      code: projects.code,
      customer: customers.name,
    })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .leftJoin(paymentMilestones, eq(paymentMilestones.id, payments.milestoneId))
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!row) return;
  const { payment } = row;
  if (payment.reversesPaymentId) {
    await postPaymentReversal(db, payment.reversesPaymentId, userId, payment.reversalReason);
    return;
  }
  if (payment.amountPaise <= 0) return;
  const milestoneDue = row.dueAt !== null && row.dueAt <= payment.createdAt;
  const from = payment.payer === 'bank' ? `the bank for ${row.customer}` : row.customer;
  await postJournal(db, {
    entryDate: payment.receivedOn,
    memo: `${row.code} · ${formatInr(payment.amountPaise)} ${payment.paidFromCredit ? 'of credit applied for' : 'received from'} ${from}${row.label ? ` (${row.label})` : ''}`,
    sourceType: 'payment',
    sourceId: payment.id,
    projectId: payment.projectId,
    postedByUserId: userId,
    lines: paymentPosting({
      payer: payment.payer,
      method: payment.method,
      amountPaise: payment.amountPaise,
      milestoneDue,
      fromCredit: payment.paidFromCredit,
    }),
  });
}

async function postPaymentReversal(
  db: DatabaseExecutor,
  originalPaymentId: string,
  userId: string | null,
  reason: string | null,
): Promise<void> {
  const [original] = await db
    .select({
      id: journalEntries.id,
      number: journalEntries.number,
      projectId: journalEntries.projectId,
    })
    .from(journalEntries)
    .where(
      and(eq(journalEntries.sourceType, 'payment'), eq(journalEntries.sourceId, originalPaymentId)),
    )
    .limit(1);
  if (!original) return;
  const [payment] = await db
    .select({ milestoneId: payments.milestoneId, payer: payments.payer })
    .from(payments)
    .where(eq(payments.id, originalPaymentId))
    .limit(1);
  const [applied] = payment?.milestoneId
    ? await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.sourceType, 'advance_applied'),
            eq(journalEntries.sourceId, payment.milestoneId),
          ),
        )
        .limit(1)
    : [];
  // An advance already set against its milestone now sits in the receivable, so
  // reversing it puts the amount back on the receivable, not on advances.
  const receivable =
    payment?.payer === 'bank' ? ACCOUNT.bankLoanReceivables : ACCOUNT.customerReceivables;
  const remap = applied ? { [ACCOUNT.advancesReceived]: receivable } : {};
  await reverseEntry(db, original, userId, reason ?? 'Payment reversed', remap);
}

/** Posts the mirror image of an entry, once. `remap` moves lines to another account. */
export async function reverseEntry(
  db: DatabaseExecutor,
  original: { readonly id: string; readonly number: number; readonly projectId: string | null },
  userId: string | null,
  reason: string,
  remap: Partial<Record<LedgerAccountCode, LedgerAccountCode>> = {},
): Promise<string | null> {
  const lines = await db
    .select({
      account: journalLines.accountCode,
      debitPaise: journalLines.debitPaise,
      creditPaise: journalLines.creditPaise,
    })
    .from(journalLines)
    .where(eq(journalLines.entryId, original.id))
    .orderBy(asc(journalLines.position));
  return postJournal(db, {
    entryDate: todayIn('Asia/Kolkata'),
    memo: `Reversal of JV-${original.number}: ${reason}`,
    sourceType: 'reversal',
    sourceId: original.id,
    projectId: original.projectId,
    reversesEntryId: original.id,
    postedByUserId: userId,
    lines: reversalPosting(
      lines.map((line) => {
        const account = line.account as LedgerAccountCode;
        return { ...line, account: remap[account] ?? account };
      }),
    ),
  });
}
