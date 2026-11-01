import {
  customerCreditPosting,
  gatewayFeePosting,
  type RefundMethod,
  refundPosting,
} from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { customerCredits, customerRefunds, paymentMilestones, projects } from '../schema';
import { postJournal } from './post-journal';

const REFUND_METHODS: readonly RefundMethod[] = [
  'cash',
  'cheque',
  'bank_transfer',
  'upi',
  'razorpay',
];

/**
 * Money that arrived with nothing owed against it: held as customer credit, booked once.
 * When the whole online payment was extra, its gateway fee is booked here too.
 */
export async function postCustomerCredit(
  db: DatabaseExecutor,
  creditId: string,
  userId: string | null,
): Promise<void> {
  const [row] = await db
    .select({ credit: customerCredits, code: projects.code })
    .from(customerCredits)
    .innerJoin(projects, eq(projects.id, customerCredits.projectId))
    .where(eq(customerCredits.id, creditId))
    .limit(1);
  if (!row || row.credit.amountPaise <= 0) return;
  const { credit } = row;
  const base = {
    projectId: credit.projectId,
    postedByUserId: userId,
    entryDate: credit.receivedOn,
  };
  await postJournal(db, {
    ...base,
    memo: `${row.code} · ${formatInr(credit.amountPaise)} held as customer credit${credit.reference ? ` (${credit.reference})` : ''}`,
    sourceType: 'customer_credit',
    sourceId: credit.id,
    lines: customerCreditPosting({ method: credit.method, amountPaise: credit.amountPaise }),
  });
  const fee = credit.gatewayFeePaise ?? 0;
  if (fee > 0) {
    await postJournal(db, {
      ...base,
      memo: `${row.code} · gateway fee on ${credit.gatewayPaymentId ?? 'online payment'}`,
      sourceType: 'gateway_fee',
      sourceId: credit.id,
      lines: gatewayFeePosting({ feePaise: fee }),
    });
  }
}

/**
 * A refund paid out, booked once. From credit it lowers customer credit; from a
 * milestone it comes out of the advance or the receivable that payment had settled.
 */
export async function postCustomerRefund(
  db: DatabaseExecutor,
  refundId: string,
  userId: string | null,
): Promise<void> {
  const [row] = await db
    .select({
      refund: customerRefunds,
      code: projects.code,
      payer: paymentMilestones.payer,
      dueAt: paymentMilestones.dueAt,
    })
    .from(customerRefunds)
    .innerJoin(projects, eq(projects.id, customerRefunds.projectId))
    .leftJoin(paymentMilestones, eq(paymentMilestones.id, customerRefunds.milestoneId))
    .where(eq(customerRefunds.id, refundId))
    .limit(1);
  if (!row || row.refund.amountPaise <= 0) return;
  const { refund } = row;
  const method = REFUND_METHODS.find((entry) => entry === refund.method) ?? 'bank_transfer';
  const source = refund.milestoneId
    ? {
        from: 'milestone' as const,
        payer: row.payer ?? 'customer',
        milestoneDue: row.dueAt !== null && row.dueAt <= refund.createdAt,
      }
    : { from: 'credit' as const };
  await postJournal(db, {
    entryDate: refund.paidOn,
    memo: `${row.code} · ${formatInr(refund.amountPaise)} refunded: ${refund.reason}${refund.reference ? ` · ${refund.reference}` : ''}`,
    sourceType: 'customer_refund',
    sourceId: refund.id,
    projectId: refund.projectId,
    postedByUserId: userId,
    lines: refundPosting({ method, amountPaise: refund.amountPaise, source }),
  });
}
