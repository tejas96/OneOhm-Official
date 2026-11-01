import { Inject, Injectable } from '@nestjs/common';
import type { ReceivedPayment } from '@oneohm/api-contracts';
import { businessDate, customers, paymentMilestones, payments, projects } from '@oneohm/database';
import { financialYear } from '@oneohm/domain';
import { asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

/**
 * Receipt numbers, per Indian financial year, in the order payments were recorded:
 * OH/RCPT/2026-27/0001. Payments are never deleted, so a number never changes.
 */
export async function receiptNumbers(db: Database): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: payments.id, createdAt: payments.createdAt })
    .from(payments)
    .where(isNull(payments.reversesPaymentId))
    .orderBy(asc(payments.createdAt), asc(payments.id));
  const counters = new Map<string, number>();
  const numbers = new Map<string, string>();
  for (const row of rows) {
    const year = financialYear(businessDate(row.createdAt));
    const next = (counters.get(year) ?? 0) + 1;
    counters.set(year, next);
    numbers.set(row.id, `OH/RCPT/${year}/${String(next).padStart(4, '0')}`);
  }
  return numbers;
}

/** Money received, newest first, with receipt numbers and reversals marked. */
@Injectable()
export class PaymentsReadService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(limit: number): Promise<ReceivedPayment[]> {
    const rows = await this.query().orderBy(desc(payments.createdAt)).limit(limit);
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
    const numbers = await receiptNumbers(this.db);
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
      receiptNumber: numbers.get(payment.id) ?? null,
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
    }));
  }
}
