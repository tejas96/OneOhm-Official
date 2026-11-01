import { Inject, Injectable } from '@nestjs/common';
import type { ReceivedPayment } from '@oneohm/api-contracts';
import {
  customerRefunds,
  loanTranches,
  paymentMilestones,
  payments,
  postPayment,
  projectActivities,
  projectLoans,
  projects,
  type Transaction,
} from '@oneohm/database';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { PaymentsReadService } from './payments-read.service';

/** The milestone's status follows what is now paid against it. */
export async function reopenMilestone(tx: Transaction, milestoneId: string) {
  const [milestone] = await tx
    .select()
    .from(paymentMilestones)
    .where(eq(paymentMilestones.id, milestoneId))
    .limit(1);
  if (!milestone) return;
  const [paid] = await tx
    .select({ total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
    .from(payments)
    .where(eq(payments.milestoneId, milestoneId));
  const total = Number(paid?.total ?? 0);
  const unpaid = milestone.dueAt ? 'due' : 'upcoming';
  const status = total >= milestone.amountPaise ? 'paid' : total > 0 ? 'partly_paid' : unpaid;
  await tx
    .update(paymentMilestones)
    .set({ status, updatedAt: new Date() })
    .where(eq(paymentMilestones.id, milestoneId));
}

/** A reversed bank payment reopens its tranche and steps the loan's status back. */
async function reopenDisbursement(tx: Transaction, paymentId: string, projectId: string) {
  await tx
    .update(loanTranches)
    .set({ status: 'claimed', paymentId: null })
    .where(eq(loanTranches.paymentId, paymentId));
  const bank = await tx
    .select({ id: paymentMilestones.id, amount: paymentMilestones.amountPaise })
    .from(paymentMilestones)
    .where(and(eq(paymentMilestones.projectId, projectId), eq(paymentMilestones.payer, 'bank')));
  if (bank.length === 0) return;
  const [paid] = await tx
    .select({ total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
    .from(payments)
    .where(
      inArray(
        payments.milestoneId,
        bank.map((milestone) => milestone.id),
      ),
    );
  const share = bank.reduce((sum, milestone) => sum + milestone.amount, 0);
  const received = Number(paid?.total ?? 0);
  const status =
    received >= share && received > 0 ? 'disbursed' : received > 0 ? 'disbursing' : 'sanctioned';
  await tx
    .update(projectLoans)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(projectLoans.projectId, projectId),
        inArray(projectLoans.status, ['disbursing', 'disbursed']),
      ),
    );
}

/**
 * Undoes a payment recorded by mistake without editing it (PRD 3.11, 7.3): a reversal
 * row with the negative amount, the milestone reopened, the project's financial closure
 * lifted if it had closed, and a reversing journal entry, all in one transaction.
 */
@Injectable()
export class PaymentReversalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly read: PaymentsReadService,
  ) {}

  async reverse(actor: Actor, paymentId: string, reason: string): Promise<ReceivedPayment> {
    const id = await this.db.transaction(async (tx) => {
      const [original] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for('update')
        .limit(1);
      if (!original) throw notFound('That payment');
      if (original.reversesPaymentId) throw conflict('A reversal cannot itself be reversed.');
      if (original.amountPaise < 0) throw conflict('A refund is not reversed here.');
      await this.refuseIfRefunded(tx, original.milestoneId);
      const [already] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.reversesPaymentId, original.id))
        .limit(1);
      if (already) throw conflict('This payment has already been reversed.');

      const [reversal] = await tx
        .insert(payments)
        .values({
          projectId: original.projectId,
          milestoneId: original.milestoneId,
          payer: original.payer,
          method: original.method,
          amountPaise: -original.amountPaise,
          receivedOn: todayIn(),
          reference: original.reference ? `Reversal of ${original.reference}` : 'Reversal',
          recordedByUserId: actor.userId,
          reversesPaymentId: original.id,
          reversalReason: reason,
          paidFromCredit: original.paidFromCredit,
        })
        .returning({ id: payments.id });
      if (!reversal) throw new Error('Reversal insert returned nothing.');

      if (original.milestoneId) await reopenMilestone(tx, original.milestoneId);
      await tx
        .update(projects)
        .set({ financiallyClosedAt: null, updatedAt: new Date() })
        .where(eq(projects.id, original.projectId));
      if (original.payer === 'bank') await reopenDisbursement(tx, original.id, original.projectId);
      await tx.insert(projectActivities).values({
        projectId: original.projectId,
        kind: 'payment',
        message: `${formatInr(original.amountPaise)} payment reversed: ${reason}`,
        userId: actor.userId,
      });
      await postPayment(tx, reversal.id, actor.userId);
      await recordAudit(tx, actor.userId, 'payment.reversed', 'payment', original.id, {
        amountPaise: original.amountPaise,
        reason,
      });
      return reversal.id;
    });
    return this.read.get(id);
  }

  /** After a refund of milestone money, reversing the original would count it twice. */
  private async refuseIfRefunded(tx: Transaction, milestoneId: string | null): Promise<void> {
    if (!milestoneId) return;
    const [refund] = await tx
      .select({ id: customerRefunds.id })
      .from(customerRefunds)
      .where(eq(customerRefunds.milestoneId, milestoneId))
      .limit(1);
    if (refund) {
      throw conflict('Money on this milestone was refunded, so its payments cannot be reversed.');
    }
  }
}
