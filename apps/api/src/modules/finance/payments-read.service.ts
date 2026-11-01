import { Inject, Injectable } from '@nestjs/common';
import type { ReceivedPayment } from '@oneohm/api-contracts';
import { customers, paymentMilestones, payments, projects } from '@oneohm/database';
import { desc, eq, gt, isNotNull, or } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

/** Money received, newest first, with receipt numbers and reversals marked. */
@Injectable()
export class PaymentsReadService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** A refund's release row (negative, reversing nothing) shows as its refund instead. */
  async list(limit: number): Promise<ReceivedPayment[]> {
    const rows = await this.query()
      .where(or(gt(payments.amountPaise, 0), isNotNull(payments.reversesPaymentId)))
      .orderBy(desc(payments.createdAt))
      .limit(limit);
    return this.present(rows);
  }

  async get(id: string): Promise<ReceivedPayment> {
    const rows = await this.query().where(eq(payments.id, id)).limit(1);
    const [payment] = await this.present(rows);
    if (!payment) throw notFound('That payment');
    return payment;
  }

  private query() {
    return this.db
      .select({
        payment: payments,
        projectCode: projects.code,
        customerName: customers.name,
        milestoneLabel: paymentMilestones.label,
      })
      .from(payments)
      .innerJoin(projects, eq(projects.id, payments.projectId))
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .leftJoin(paymentMilestones, eq(paymentMilestones.id, payments.milestoneId))
      .$dynamic();
  }

  private async present(
    rows: Awaited<ReturnType<PaymentsReadService['query']>>,
  ): Promise<ReceivedPayment[]> {
    if (rows.length === 0) return [];
    const reversed = new Set(
      (
        await this.db
          .select({ id: payments.reversesPaymentId })
          .from(payments)
          .where(isNotNull(payments.reversesPaymentId))
      )
        .map((row) => row.id)
        .filter((id) => id !== null),
    );
    return rows.map(({ payment, projectCode, customerName, milestoneLabel }) => ({
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      projectId: payment.projectId,
      projectCode,
      customerName,
      milestoneLabel,
      payer: payment.payer,
      method: payment.method,
      amountPaise: payment.amountPaise,
      receivedOn: payment.receivedOn,
      reference: payment.reference,
      reversed: reversed.has(payment.id),
      reversesPaymentId: payment.reversesPaymentId,
      reversalReason: payment.reversalReason,
      createdAt: payment.createdAt.toISOString(),
    }));
  }
}
