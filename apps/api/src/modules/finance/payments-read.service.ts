import { Inject, Injectable } from '@nestjs/common';
import type { ReceivedPayment } from '@oneohm/api-contracts';
import { customers, paymentMilestones, payments, projects } from '@oneohm/database';
import { desc, eq, gt, isNotNull, or, sql } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

/** Money in and reversals; a refund's release row shows as its refund instead. */
const SHOWN = or(gt(payments.amountPaise, 0), isNotNull(payments.reversesPaymentId));

/** Money received, newest first, with receipt numbers and reversals marked. */
@Injectable()
export class PaymentsReadService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** A refund's release row (negative, reversing nothing) shows as its refund instead. */
  async list(limit: number, offset = 0): Promise<ReceivedPayment[]> {
    const rows = await this.query()
      .where(SHOWN)
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(limit)
      .offset(offset);
    return this.present(rows);
  }

  /** How many rows `list` can show in all, for a paged list. */
  async count(): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(payments)
      .where(SHOWN);
    return row?.total ?? 0;
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
      tdsPaise: payment.tdsPaise,
      receivedOn: payment.receivedOn,
      reference: payment.reference,
      reversed: reversed.has(payment.id),
      reversesPaymentId: payment.reversesPaymentId,
      reversalReason: payment.reversalReason,
      createdAt: payment.createdAt.toISOString(),
    }));
  }
}
