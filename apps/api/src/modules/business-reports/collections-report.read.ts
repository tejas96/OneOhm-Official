import {
  businessDate,
  customerCredits,
  customerRefunds,
  customers,
  type DatabaseExecutor,
  paymentMilestones,
  payments,
  projects,
  quotations,
} from '@oneohm/database';
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { MilestoneFact, MoneyMove } from './collections-report.math';
import { managedInRange, type ReportScope } from './report-scope';

export interface ProjectFact {
  readonly id: string;
  readonly code: string;
  readonly customerName: string;
  readonly contractPaise: number;
}

/** Live projects for the filters, with the accepted quotation's price (with GST). */
export async function readProjects(
  db: DatabaseExecutor,
  scope: ReportScope,
): Promise<ProjectFact[]> {
  return db
    .select({
      id: projects.id,
      code: projects.code,
      customerName: customers.name,
      contractPaise: quotations.totalPaise,
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(scope.projects);
}

const paidSum = sql<string>`coalesce(sum(${payments.amountPaise}), 0)`;

/** Every milestone of these projects with what is paid against it (credit included). */
export async function readMilestones(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<MilestoneFact[]> {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({
      id: paymentMilestones.id,
      projectId: paymentMilestones.projectId,
      payer: paymentMilestones.payer,
      amountPaise: paymentMilestones.amountPaise,
      status: paymentMilestones.status,
      dueAt: paymentMilestones.dueAt,
    })
    .from(paymentMilestones)
    .where(inArray(paymentMilestones.projectId, [...projectIds]));
  if (rows.length === 0) return [];
  const paid = await db
    .select({ milestoneId: payments.milestoneId, total: paidSum })
    .from(payments)
    .where(
      inArray(
        payments.milestoneId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(payments.milestoneId);
  const paidBy = new Map(paid.map((row) => [row.milestoneId, Number(row.total)]));
  return rows.map((row) => ({
    projectId: row.projectId,
    payer: row.payer,
    amountPaise: row.amountPaise,
    paidPaise: paidBy.get(row.id) ?? 0,
    paid: row.status === 'paid',
    dueOn: row.dueAt ? businessDate(row.dueAt) : null,
  }));
}

/** Everything paid towards each project so far, reversals and refunds included. */
export async function readPaidByProject(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: payments.projectId, total: paidSum })
    .from(payments)
    .where(inArray(payments.projectId, [...projectIds]))
    .groupBy(payments.projectId);
  return new Map(rows.map((row) => [row.projectId, Number(row.total)]));
}

/**
 * New money in the range for the manager and type filters, cancelled projects included
 * (their money still came in): payments not taken from credit, overpayments held as
 * credit, and credit paid back. Refunds against a milestone are already negative payments.
 */
export async function readMoneyMoves(
  db: DatabaseExecutor,
  scope: ReportScope,
): Promise<MoneyMove[]> {
  const { start, end } = scope.meta.range;
  const filters = and(
    scope.managerUserId ? managedInRange(scope.managerUserId, scope.from, scope.until) : undefined,
    scope.projectType ? eq(projects.type, scope.projectType) : undefined,
  );
  const paid = await db
    .select({
      payer: payments.payer,
      method: payments.method,
      amountPaise: payments.amountPaise,
      on: payments.receivedOn,
    })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .where(
      and(
        eq(payments.paidFromCredit, false),
        gte(payments.receivedOn, start),
        lte(payments.receivedOn, end),
        filters,
      ),
    );
  const credited = await db
    .select({
      method: customerCredits.method,
      amountPaise: customerCredits.amountPaise,
      on: customerCredits.receivedOn,
    })
    .from(customerCredits)
    .innerJoin(projects, eq(projects.id, customerCredits.projectId))
    .where(
      and(gte(customerCredits.receivedOn, start), lte(customerCredits.receivedOn, end), filters),
    );
  const refunded = await db
    .select({
      method: customerRefunds.method,
      amountPaise: customerRefunds.amountPaise,
      on: customerRefunds.paidOn,
    })
    .from(customerRefunds)
    .innerJoin(projects, eq(projects.id, customerRefunds.projectId))
    .where(
      and(
        isNull(customerRefunds.milestoneId),
        gte(customerRefunds.paidOn, start),
        lte(customerRefunds.paidOn, end),
        filters,
      ),
    );
  return [
    ...paid,
    ...credited.map((row) => ({ ...row, payer: 'customer' as const })),
    ...refunded.map((row) => ({
      ...row,
      amountPaise: -row.amountPaise,
      payer: 'customer' as const,
    })),
  ];
}
