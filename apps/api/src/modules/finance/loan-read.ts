import type { ProjectLoan } from '@oneohm/api-contracts';
import {
  customers,
  loanTranches,
  paymentMilestones,
  payments,
  projectLoans,
  projects,
  projectTasks,
} from '@oneohm/database';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Database } from '../../config/core.module';

const CLAIM_TASK = 'loan_disbursement_claim';

/**
 * Every loan project with its bank share, what the bank has paid and whether it is time
 * to claim. A project finance has not opened yet shows what the project already knows.
 */
export async function readLoans(
  db: Database,
  projectIds?: readonly string[],
): Promise<ProjectLoan[]> {
  const rows = await db
    .select({
      projectId: projects.id,
      code: projects.code,
      projectLender: projects.lenderName,
      customerName: customers.name,
      loan: projectLoans,
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .leftJoin(projectLoans, eq(projectLoans.projectId, projects.id))
    .where(
      and(
        eq(projects.loan, true),
        ne(projects.status, 'cancelled'),
        projectIds ? inArray(projects.id, [...projectIds]) : undefined,
      ),
    )
    .orderBy(desc(projects.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.projectId);
  const bank = await db
    .select()
    .from(paymentMilestones)
    .where(and(inArray(paymentMilestones.projectId, ids), eq(paymentMilestones.payer, 'bank')));
  const received = bank.length
    ? await db
        .select({
          milestoneId: payments.milestoneId,
          total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)`,
        })
        .from(payments)
        .where(
          inArray(
            payments.milestoneId,
            bank.map((milestone) => milestone.id),
          ),
        )
        .groupBy(payments.milestoneId)
    : [];
  const claims = await db
    .select({ projectId: projectTasks.projectId, status: projectTasks.status })
    .from(projectTasks)
    .where(and(inArray(projectTasks.projectId, ids), eq(projectTasks.templateKey, CLAIM_TASK)));
  const loanIds = rows.map((row) => row.loan?.id).filter((id): id is string => Boolean(id));
  const tranches = loanIds.length
    ? await db
        .select()
        .from(loanTranches)
        .where(inArray(loanTranches.loanId, loanIds))
        .orderBy(asc(loanTranches.position))
    : [];

  return rows.map(({ projectId, code, projectLender, customerName, loan }): ProjectLoan => {
    const milestones = bank.filter((milestone) => milestone.projectId === projectId);
    const bankSharePaise = milestones.reduce((sum, milestone) => sum + milestone.amountPaise, 0);
    const receivedPaise = received
      .filter((row) => milestones.some((milestone) => milestone.id === row.milestoneId))
      .reduce((sum, row) => sum + Number(row.total), 0);
    const claimDone = claims.some(
      (claim) => claim.projectId === projectId && claim.status === 'completed',
    );
    const milestoneDue = milestones.some((milestone) => milestone.dueAt !== null);
    return {
      projectId,
      projectCode: code,
      customerName,
      started: loan !== null,
      version: loan?.version ?? null,
      lendingPartnerId: loan?.lendingPartnerId ?? null,
      lenderName: loan?.lenderName ?? projectLender ?? '',
      applicationNumber: loan?.applicationNumber ?? null,
      status: loan?.status ?? 'collecting_documents',
      sanctionedPaise: loan?.sanctionedPaise ?? null,
      sanctionedOn: loan?.sanctionedOn ?? null,
      documents: loan?.documents ?? [],
      notes: loan?.notes ?? null,
      bankMilestoneId: milestones[0]?.id ?? null,
      bankSharePaise,
      receivedPaise,
      readyToClaim: (claimDone || milestoneDue) && receivedPaise < bankSharePaise,
      tranches: tranches
        .filter((tranche) => tranche.loanId === loan?.id)
        .map((tranche) => ({
          id: tranche.id,
          label: tranche.label,
          amountPaise: tranche.amountPaise,
          expectedOn: tranche.expectedOn,
          status: tranche.status,
          claimedOn: tranche.claimedOn,
          paymentId: tranche.paymentId,
        })),
    };
  });
}
