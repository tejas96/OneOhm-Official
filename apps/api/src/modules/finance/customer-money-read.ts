import type { CustomerMoneyEntry } from '@oneohm/api-contracts';
import {
  customerCredits,
  customerRefunds,
  customers,
  type DatabaseExecutor,
  paymentMilestones,
  payments,
  projects,
} from '@oneohm/database';
import { type AnyColumn, and, desc, eq, gt, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';

const sum = (column: AnyColumn) => sql<string>`coalesce(sum(${column}), 0)`;

/**
 * What OneOhm holds for the customer on a project: credit received, less what was
 * applied to milestones (net of reversals) and what was refunded out of credit.
 */
export async function creditBalance(db: DatabaseExecutor, projectId: string): Promise<number> {
  const [received] = await db
    .select({ total: sum(customerCredits.amountPaise) })
    .from(customerCredits)
    .where(eq(customerCredits.projectId, projectId));
  const [applied] = await db
    .select({ total: sum(payments.amountPaise) })
    .from(payments)
    .where(and(eq(payments.projectId, projectId), eq(payments.paidFromCredit, true)));
  const [refunded] = await db
    .select({ total: sum(customerRefunds.amountPaise) })
    .from(customerRefunds)
    .where(and(eq(customerRefunds.projectId, projectId), isNull(customerRefunds.milestoneId)));
  return Number(received?.total ?? 0) - Number(applied?.total ?? 0) - Number(refunded?.total ?? 0);
}

const forProject = (projectId: string | undefined, column: typeof projects.id) =>
  projectId ? eq(column, projectId) : undefined;

async function creditsIn(db: DatabaseExecutor, projectId: string | undefined, limit: number) {
  const rows = await db
    .select({
      row: customerCredits,
      code: projects.code,
      customer: customers.name,
      label: paymentMilestones.label,
    })
    .from(customerCredits)
    .innerJoin(projects, eq(projects.id, customerCredits.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .leftJoin(paymentMilestones, eq(paymentMilestones.id, customerCredits.milestoneId))
    .where(forProject(projectId, projects.id))
    .orderBy(desc(customerCredits.createdAt))
    .limit(limit);
  return rows.map(
    ({ row, code, customer, label }): CustomerMoneyEntry => ({
      id: row.id,
      kind: 'credit_received',
      projectId: row.projectId,
      projectCode: code,
      customerName: customer,
      amountPaise: row.amountPaise,
      date: row.receivedOn,
      method: row.method,
      reference: row.reference,
      milestoneLabel: label,
      reason: null,
      releasePaymentId: null,
      createdAt: row.createdAt.toISOString(),
    }),
  );
}

async function creditApplied(db: DatabaseExecutor, projectId: string | undefined, limit: number) {
  const reversed = db
    .select({ id: payments.reversesPaymentId })
    .from(payments)
    .where(isNotNull(payments.reversesPaymentId));
  const rows = await db
    .select({
      row: payments,
      code: projects.code,
      customer: customers.name,
      label: paymentMilestones.label,
    })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .leftJoin(paymentMilestones, eq(paymentMilestones.id, payments.milestoneId))
    .where(
      and(
        eq(payments.paidFromCredit, true),
        gt(payments.amountPaise, 0),
        notInArray(payments.id, reversed),
        forProject(projectId, projects.id),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(limit);
  return rows.map(
    ({ row, code, customer, label }): CustomerMoneyEntry => ({
      id: row.id,
      kind: 'credit_applied',
      projectId: row.projectId,
      projectCode: code,
      customerName: customer,
      amountPaise: row.amountPaise,
      date: row.receivedOn,
      method: row.method,
      reference: row.receiptNumber ?? row.reference,
      milestoneLabel: label,
      reason: null,
      releasePaymentId: null,
      createdAt: row.createdAt.toISOString(),
    }),
  );
}

async function refundsOut(db: DatabaseExecutor, projectId: string | undefined, limit: number) {
  const rows = await db
    .select({
      row: customerRefunds,
      code: projects.code,
      customer: customers.name,
      label: paymentMilestones.label,
    })
    .from(customerRefunds)
    .innerJoin(projects, eq(projects.id, customerRefunds.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .leftJoin(paymentMilestones, eq(paymentMilestones.id, customerRefunds.milestoneId))
    .where(forProject(projectId, projects.id))
    .orderBy(desc(customerRefunds.createdAt))
    .limit(limit);
  return rows.map(
    ({ row, code, customer, label }): CustomerMoneyEntry => ({
      id: row.id,
      kind: 'refund',
      projectId: row.projectId,
      projectCode: code,
      customerName: customer,
      amountPaise: row.amountPaise,
      date: row.paidOn,
      method: row.method,
      reference: row.reference,
      milestoneLabel: label,
      reason: row.reason,
      releasePaymentId: row.releasePaymentId,
      createdAt: row.createdAt.toISOString(),
    }),
  );
}

/** Credit received, credit applied and refunds, newest first. */
export async function customerMoneyEntries(
  db: DatabaseExecutor,
  filter: { readonly projectId?: string; readonly limit: number },
): Promise<CustomerMoneyEntry[]> {
  const parts = await Promise.all([
    creditsIn(db, filter.projectId, filter.limit),
    creditApplied(db, filter.projectId, filter.limit),
    refundsOut(db, filter.projectId, filter.limit),
  ]);
  return parts
    .flat()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, filter.limit);
}
