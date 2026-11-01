import { Inject, Injectable } from '@nestjs/common';
import {
  customers,
  nextReceiptNumber,
  paymentMilestones,
  payments,
  postGatewayFee,
  postPayment,
  projectActivities,
  projects,
  type Transaction,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { invalid, notFound } from '../../common/http/errors';
import { queueWhatsApp } from '../../common/outbox';
import { DATABASE, type Database } from '../../config/core.module';
import { closeOpenLinks } from '../online-payments/close-links';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../online-payments/gateway';
import { checkCollected, recordHandling } from './payment-handling';

export interface NewPayment {
  milestoneId: string;
  amountPaise: number;
  method: 'cash' | 'cheque' | 'bank_transfer' | 'upi' | 'razorpay' | 'bank_disbursement';
  receivedOn: string;
  reference?: string | null | undefined;
  /** Online payments only: the gateway's payment ID and the fee it kept. */
  gatewayPaymentId?: string | null | undefined;
  gatewayFeePaise?: number | null | undefined;
  /** Paid out of the customer's credit (an earlier overpayment), not new money. */
  paidFromCredit?: boolean | undefined;
  /** Cash or cheque: who holds it, and the cheque's details (see payment-handling). */
  collectedByUserId?: string | null | undefined;
  chequeNumber?: string | null | undefined;
  chequeBank?: string | null | undefined;
  chequeDate?: string | null | undefined;
}

/** Who records a payment: a person, or no one for a gateway webhook. */
export interface PaymentRecorder {
  readonly userId: string | null;
}

/** Every rupee received is recorded against a milestone and reconciled (PRD 3.11). */
@Injectable()
export class FinanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /**
   * Records the payment, its ledger entry and its side effects in one transaction.
   * `alsoInTransaction` lets a caller (such as a loan disbursement) add its own writes.
   */
  async recordPayment(
    actor: PaymentRecorder,
    projectId: string,
    input: NewPayment,
    alsoInTransaction?: (tx: Transaction, paymentId: string) => Promise<void>,
  ): Promise<string> {
    const [milestone] = await this.db
      .select()
      .from(paymentMilestones)
      .where(
        and(
          eq(paymentMilestones.id, input.milestoneId),
          eq(paymentMilestones.projectId, projectId),
        ),
      )
      .limit(1);
    if (!milestone) throw notFound('That payment milestone');
    const [paid] = await this.db
      .select({ total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint` })
      .from(payments)
      .where(eq(payments.milestoneId, milestone.id));
    const already = Number(paid?.total ?? 0);
    if (already + input.amountPaise > milestone.amountPaise) {
      throw invalid('This is more than is left on the milestone.', {
        amountPaise: `At most ${formatInr(milestone.amountPaise - already)} is left on this milestone.`,
      });
    }
    if (milestone.payer === 'bank' && input.method !== 'bank_disbursement') {
      throw invalid('The bank share is recorded as a bank disbursement.', {
        method: 'Choose bank disbursement.',
      });
    }
    checkCollected(input);
    const id = await this.db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          projectId,
          milestoneId: milestone.id,
          payer: milestone.payer,
          method: input.method,
          amountPaise: input.amountPaise,
          receivedOn: input.receivedOn,
          reference: input.reference ?? null,
          recordedByUserId: actor.userId,
          receiptNumber: await nextReceiptNumber(tx, input.receivedOn),
          gatewayPaymentId: input.gatewayPaymentId ?? null,
          gatewayFeePaise: input.gatewayFeePaise ?? null,
          paidFromCredit: input.paidFromCredit ?? false,
        })
        .returning({ id: payments.id });
      if (!payment) throw new Error('Payment insert returned nothing.');
      const total = already + input.amountPaise;
      const status = total >= milestone.amountPaise ? 'paid' : 'partly_paid';
      await tx
        .update(paymentMilestones)
        .set({ status, updatedAt: new Date() })
        .where(eq(paymentMilestones.id, milestone.id));
      const open = await tx
        .select({ id: paymentMilestones.id })
        .from(paymentMilestones)
        .where(
          and(
            eq(paymentMilestones.projectId, projectId),
            sql`${paymentMilestones.status} <> 'paid'`,
          ),
        );
      const [project] = await tx
        .select({
          status: projects.status,
          code: projects.code,
          phone: customers.phoneE164,
          name: customers.name,
        })
        .from(projects)
        .innerJoin(customers, eq(customers.id, projects.customerId))
        .where(eq(projects.id, projectId))
        .limit(1);
      if (open.length === 0 && project?.status === 'completed') {
        await tx
          .update(projects)
          .set({ financiallyClosedAt: new Date(), updatedAt: new Date() })
          .where(eq(projects.id, projectId));
      }
      await tx.insert(projectActivities).values({
        projectId,
        kind: 'payment',
        message: `${formatInr(input.amountPaise)} received (${milestone.label}).`,
        userId: actor.userId,
      });
      if (project && milestone.payer === 'customer') {
        await queueWhatsApp(
          tx,
          project.phone,
          'payment_received',
          {
            customer: project.name,
            project: project.code,
            amount: formatInr(input.amountPaise),
            milestone: milestone.label,
          },
          `payment:${milestone.id}:${total}`,
        );
      }
      await recordAudit(tx, actor.userId, 'payment.recorded', 'project', projectId, {
        milestoneId: milestone.id,
        amountPaise: input.amountPaise,
        method: input.method,
      });
      await recordHandling(tx, payment.id, input, actor.userId);
      await postPayment(tx, payment.id, actor.userId);
      await postGatewayFee(tx, payment.id, actor.userId);
      if (alsoInTransaction) await alsoInTransaction(tx, payment.id);
      return payment.id;
    });
    if (!input.gatewayPaymentId) await closeOpenLinks(this.db, this.gateway, milestone.id);
    return id;
  }
}
