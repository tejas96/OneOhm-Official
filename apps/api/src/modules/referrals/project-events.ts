import {
  type DatabaseExecutor,
  leads,
  paymentMilestones,
  payments,
  projects,
  quotations,
} from '@oneohm/database';
import type { ProjectEventDates, ProjectType } from '@oneohm/domain';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';

export interface ProjectFacts extends ProjectEventDates {
  readonly id: string;
  readonly code: string;
  readonly customerId: string;
  readonly type: ProjectType;
  readonly capacityWp: number;
  readonly status: string;
  readonly startDate: string;
  /** The contract price: every milestone, or the quotation total before milestones exist. */
  readonly valuePaise: number;
}

type MilestoneRow = {
  id: string;
  projectId: string;
  trigger: string;
  payer: string;
  status: string;
  amountPaise: number;
  dueAt: Date | null;
};

const latest = (dates: readonly Date[]) =>
  dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;

/**
 * When the advance was paid: every customer milestone due on order confirmation is
 * fully paid. Projects without one count the first money received.
 */
function advancePaidAt(
  milestones: readonly MilestoneRow[],
  received: readonly { milestoneId: string | null; amountPaise: number; createdAt: Date }[],
): Date | null {
  const advance = milestones.filter(
    (row) => row.trigger === 'quotation_accepted' && row.payer === 'customer',
  );
  if (advance.length === 0) {
    const first = received.find((row) => row.amountPaise > 0);
    return first?.createdAt ?? null;
  }
  if (!advance.every((row) => row.status === 'paid')) return null;
  const ids = new Set(advance.map((row) => row.id));
  return (
    latest(
      received
        .filter((row) => row.milestoneId && ids.has(row.milestoneId))
        .map((row) => row.createdAt),
    ) ?? new Date()
  );
}

/** Commissioning is done when its milestone fell due, or the project went operational. */
function commissionedAt(milestones: readonly MilestoneRow[], operationalAt: Date | null) {
  const due = milestones
    .filter((row) => row.trigger === 'commissioning_completed' && row.dueAt)
    .map((row) => row.dueAt as Date);
  return due.length ? new Date(Math.min(...due.map((date) => date.getTime()))) : operationalAt;
}

/** Facts for each project, keyed by project id. */
export async function projectFacts(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<Map<string, ProjectFacts>> {
  const facts = new Map<string, ProjectFacts>();
  if (projectIds.length === 0) return facts;
  const ids = [...new Set(projectIds)];
  const rows = await db
    .select({ project: projects, total: quotations.totalPaise })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(inArray(projects.id, ids));
  const milestones: MilestoneRow[] = await db
    .select({
      id: paymentMilestones.id,
      projectId: paymentMilestones.projectId,
      trigger: paymentMilestones.trigger,
      payer: paymentMilestones.payer,
      status: paymentMilestones.status,
      amountPaise: paymentMilestones.amountPaise,
      dueAt: paymentMilestones.dueAt,
    })
    .from(paymentMilestones)
    .where(inArray(paymentMilestones.projectId, ids));
  const received = await db
    .select({
      projectId: payments.projectId,
      milestoneId: payments.milestoneId,
      amountPaise: payments.amountPaise,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(inArray(payments.projectId, ids))
    .orderBy(asc(payments.createdAt));
  for (const { project, total } of rows) {
    const own = milestones.filter((row) => row.projectId === project.id);
    const value = own.reduce((sum, row) => sum + row.amountPaise, 0);
    facts.set(project.id, {
      id: project.id,
      code: project.code,
      customerId: project.customerId,
      type: project.type,
      capacityWp: project.capacityWp,
      status: project.status,
      startDate: project.startDate,
      valuePaise: value > 0 ? value : total,
      createdAt: project.createdAt,
      advancePaidAt: advancePaidAt(
        own,
        received.filter((row) => row.projectId === project.id),
      ),
      commissionedAt: commissionedAt(own, project.operationalAt),
    });
  }
  return facts;
}

/**
 * The project each lead turned into: one quoted from the lead, or else the first project
 * of the customer the lead became, started after the lead came in.
 */
export async function projectsOfLeads(
  db: DatabaseExecutor,
  leadIds: readonly string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (leadIds.length === 0) return found;
  const rows = await db
    .select({ leadId: leads.id, projectId: projects.id })
    .from(leads)
    .innerJoin(projects, eq(projects.customerId, leads.customerId))
    .where(and(inArray(leads.id, [...leadIds]), gte(projects.createdAt, leads.createdAt)))
    .orderBy(asc(projects.createdAt));
  const quotedRows = await db
    .select({ leadId: quotations.leadId, projectId: projects.id })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(inArray(quotations.leadId, [...leadIds]))
    .orderBy(asc(projects.createdAt));
  for (const row of quotedRows) {
    if (row.leadId && !found.has(row.leadId)) found.set(row.leadId, row.projectId);
  }
  for (const row of rows) if (!found.has(row.leadId)) found.set(row.leadId, row.projectId);
  return found;
}
