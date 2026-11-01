import type { CustomerPayment, CustomerProjectMoney } from '@oneohm/api-contracts';
import { type Database, paymentMilestones, payments, projects, quotations } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';

type MilestoneRow = typeof paymentMilestones.$inferSelect;

export interface CustomerMoney {
  readonly projects: CustomerProjectMoney[];
  readonly payments: CustomerPayment[];
}

/** What came in against each milestone; a reversal's negative amount nets it off. */
async function paidByMilestone(db: Database, milestoneIds: readonly string[]) {
  if (milestoneIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({
      milestoneId: payments.milestoneId,
      total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)`,
    })
    .from(payments)
    .where(inArray(payments.milestoneId, [...milestoneIds]))
    .groupBy(payments.milestoneId);
  return new Map(rows.map((row) => [row.milestoneId ?? '', Number(row.total)]));
}

function presentMilestone(milestone: MilestoneRow, paidPaise: number) {
  return {
    id: milestone.id,
    label: milestone.label,
    payer: milestone.payer,
    amountPaise: milestone.amountPaise,
    paidPaise,
    outstandingPaise: Math.max(0, milestone.amountPaise - paidPaise),
    status: milestone.status,
    dueOn: milestone.dueAt ? todayIn('Asia/Kolkata', milestone.dueAt) : null,
  };
}

async function paymentsFor(
  db: Database,
  projectIds: readonly string[],
): Promise<CustomerPayment[]> {
  const rows = await db
    .select({
      payment: payments,
      projectCode: projects.code,
      milestoneLabel: paymentMilestones.label,
    })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .leftJoin(paymentMilestones, eq(paymentMilestones.id, payments.milestoneId))
    .where(inArray(payments.projectId, [...projectIds]))
    .orderBy(desc(payments.receivedOn), desc(payments.createdAt));
  const reversed = new Set(
    rows.map((row) => row.payment.reversesPaymentId).filter((id): id is string => id !== null),
  );
  return rows.map(({ payment, projectCode, milestoneLabel }) => ({
    id: payment.id,
    receiptNumber: payment.receiptNumber,
    project: { id: payment.projectId, code: projectCode },
    milestoneLabel,
    payer: payment.payer,
    method: payment.method,
    amountPaise: payment.amountPaise,
    receivedOn: payment.receivedOn,
    reference: payment.reference,
    reversed: reversed.has(payment.id),
    reversal: payment.reversesPaymentId !== null,
  }));
}

/** Milestones with paid and outstanding per project, and every payment received. */
export async function customerMoney(db: Database, customerId: string): Promise<CustomerMoney> {
  const projectRows = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      totalPaise: quotations.totalPaise,
      subsidyPaise: quotations.subsidyPaise,
    })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(eq(projects.customerId, customerId))
    .orderBy(asc(projects.createdAt));
  if (projectRows.length === 0) return { projects: [], payments: [] };
  const projectIds = projectRows.map((row) => row.id);
  const milestones = await db
    .select()
    .from(paymentMilestones)
    .where(inArray(paymentMilestones.projectId, projectIds))
    .orderBy(asc(paymentMilestones.position));
  const paid = await paidByMilestone(
    db,
    milestones.map((milestone) => milestone.id),
  );
  return {
    projects: projectRows.map((project) => ({
      ...project,
      milestones: milestones
        .filter((milestone) => milestone.projectId === project.id)
        .map((milestone) => presentMilestone(milestone, paid.get(milestone.id) ?? 0)),
    })),
    payments: await paymentsFor(db, projectIds),
  };
}
