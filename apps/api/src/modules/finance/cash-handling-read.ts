import type { HandledPayment } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  moneyDeposits,
  paymentHandling,
  paymentMilestones,
  payments,
  projects,
  users,
} from '@oneohm/database';
import { daysHeld } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { asc, eq, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const reversal = alias(payments, 'reversal');

/**
 * Cash and cheque payments matching `where`, oldest first. A payment that was later
 * reversed (a mistake, or a bounced cheque before this tracking) is left out unless
 * it is itself marked bounced.
 */
export async function readHandled(
  db: DatabaseExecutor,
  where: SQL | undefined,
): Promise<HandledPayment[]> {
  const today = todayIn();
  const rows = await db
    .select({
      handling: paymentHandling,
      payment: payments,
      code: projects.code,
      customer: customers.name,
      milestone: paymentMilestones.label,
      collector: users.fullName,
      deposit: moneyDeposits.number,
      reversedBy: reversal.id,
    })
    .from(paymentHandling)
    .innerJoin(payments, eq(payments.id, paymentHandling.paymentId))
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .leftJoin(paymentMilestones, eq(paymentMilestones.id, payments.milestoneId))
    .leftJoin(users, eq(users.id, paymentHandling.collectedByUserId))
    .leftJoin(moneyDeposits, eq(moneyDeposits.id, paymentHandling.depositId))
    .leftJoin(reversal, eq(reversal.reversesPaymentId, payments.id))
    .where(where)
    .orderBy(asc(payments.receivedOn), asc(payments.createdAt));
  return rows
    .filter((row) => row.reversedBy === null || row.handling.status === 'bounced')
    .map(({ handling, payment, ...row }) => ({
      paymentId: payment.id,
      projectId: payment.projectId,
      projectCode: row.code,
      customer: row.customer,
      milestone: row.milestone,
      method: payment.method === 'cheque' ? 'cheque' : 'cash',
      amountPaise: payment.amountPaise,
      receivedOn: payment.receivedOn,
      receiptNumber: payment.receiptNumber,
      collectedBy:
        handling.collectedByUserId && row.collector
          ? { id: handling.collectedByUserId, name: row.collector }
          : null,
      chequeNumber: handling.chequeNumber,
      chequeBank: handling.chequeBank,
      chequeDate: handling.chequeDate,
      status: handling.status,
      depositNumber: row.deposit,
      clearedOn: handling.clearedOn,
      bouncedOn: handling.bouncedOn,
      bounceReason: handling.bounceReason,
      daysHeld: daysHeld(payment.receivedOn, today),
    }));
}
