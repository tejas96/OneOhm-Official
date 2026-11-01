import {
  customers,
  notify,
  products,
  projectActivities,
  projectChanges,
  projectFacts,
  projects,
  properties,
  queueCustomerMessage,
  quotations,
  type Transaction,
} from '@oneohm/database';
import { flagsAfterChange, planTaskChange, type ScopeChoices } from '@oneohm/domain';
import { formatInr, formatKwp } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { initialFacts } from '../projects/project-setup';
import { adjustFinalPayment } from '../quotations/revision-accept';
import { followChangeInStore } from './change-material';
import { applyTaskPlan, loadPlanInput } from './change-plan-io';
import { acceptedLine } from './change-words';

type QuotationRow = typeof quotations.$inferSelect;

/** Report facts the system decides; a fact a task already captured on site is kept. */
const SYSTEM_FACTS = [
  'installed_capacity_kw',
  'module_count',
  'module_wattage',
  'module_total_kw',
  'module_make',
  'inverter_make',
  'inverter_total_kw',
  'system_cost',
];

const choices = (row: QuotationRow): ScopeChoices => ({
  targetWp: row.targetWp,
  panelProductId: row.panelProductId,
  inverterProductId: row.inverterProductId,
  batteryProductId: row.batteryProductId,
  structureType: row.structureType,
  extras: [],
});

async function refreshFacts(
  tx: Transaction,
  project: typeof projects.$inferSelect,
  quotation: QuotationRow,
): Promise<void> {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, project.customerId));
  const [property] = await tx
    .select()
    .from(properties)
    .where(eq(properties.id, project.propertyId));
  const [panel] = await tx.select().from(products).where(eq(products.id, quotation.panelProductId));
  const [inverter] = await tx
    .select()
    .from(products)
    .where(eq(products.id, quotation.inverterProductId));
  if (!customer || !property || !panel || !inverter) return;
  const facts = initialFacts(customer, property, quotation, panel, inverter, project.startDate);
  const saved = await tx.select().from(projectFacts).where(eq(projectFacts.projectId, project.id));
  for (const key of SYSTEM_FACTS) {
    const value = facts[key];
    if (value === undefined || saved.some((fact) => fact.key === key && fact.capturedByTaskId))
      continue;
    await tx
      .insert(projectFacts)
      .values({ projectId: project.id, key, value })
      .onConflictDoUpdate({
        target: [projectFacts.projectId, projectFacts.key],
        set: { value, updatedAt: new Date() },
      });
  }
}

/**
 * The customer accepted the revision that carries a project change (PRD 3.6, 3.15): the
 * project moves to it, the final payment takes the difference (as for a survey revision),
 * tasks follow the conditions, the store follows the material, the subsidy flag and the
 * report facts follow the system, and the customer is told. Runs in the acceptance's
 * transaction; a quotation that carries no change is left alone.
 */
export async function applyAcceptedChange(
  tx: Transaction,
  quotationId: string,
  userId: string,
): Promise<void> {
  const [found] = await tx
    .select({ change: projectChanges, project: projects })
    .from(projectChanges)
    .innerJoin(projects, eq(projects.id, projectChanges.projectId))
    .where(and(eq(projectChanges.quotationId, quotationId), eq(projectChanges.status, 'approved')))
    .limit(1);
  if (!found) return;
  const { change, project } = found;
  const [old] = await tx.select().from(quotations).where(eq(quotations.id, project.quotationId));
  const [next] = await tx.select().from(quotations).where(eq(quotations.id, quotationId));
  if (!old || !next) return;
  const flags = flagsAfterChange(project, choices(old), choices(next), next.subsidyPaise);
  const planInput = await loadPlanInput(tx, project, flags);
  const plan = planTaskChange(planInput);
  // A survey revision still waiting was replaced by this one: the price check runs again.
  const survey = project.revisionQuotationId
    ? { revisionQuotationId: null, budgetStatus: 'awaiting_survey', budgetLockedAt: null }
    : {};
  await tx
    .update(projects)
    .set({ quotationId, capacityWp: next.capacityWp, ...flags, ...survey, updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  const difference = next.totalPaise - old.totalPaise;
  const payment = await adjustFinalPayment(tx, project, difference, quotationId);
  await applyTaskPlan(tx, project, planInput, plan, userId);
  await refreshFacts(tx, project, next);
  const store = await followChangeInStore(tx, project, change.id, userId);
  await tx
    .update(projectChanges)
    .set({
      status: 'accepted',
      closedAt: new Date(),
      closedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(eq(projectChanges.id, change.id));
  const message = acceptedLine({
    number: change.number,
    old,
    next,
    payment,
    plan,
    store,
    surveyAgain: project.revisionQuotationId !== null,
  });
  await tx.insert(projectActivities).values({
    projectId: project.id,
    kind: 'scope_change',
    message,
    userId,
    data: { changeId: change.id, differencePaise: difference },
  });
  await recordAudit(tx, userId, 'project.change_accepted', 'project', project.id, {
    changeId: change.id,
    number: change.number,
    quotationId,
    totalPaise: { before: old.totalPaise, after: next.totalPaise },
    subsidyPaise: { before: old.subsidyPaise, after: next.subsidyPaise },
    flags,
    tasks: { added: plan.added.map((t) => t.key), removed: plan.removed.map((t) => t.key) },
  });
  await tellPeople(tx, project, change.id, next, message, userId);
}

/** The customer hears it the usual way (WhatsApp, then SMS); the manager sees it too. */
async function tellPeople(
  tx: Transaction,
  project: typeof projects.$inferSelect,
  changeId: string,
  next: QuotationRow,
  message: string,
  userId: string,
): Promise<void> {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, project.customerId));
  if (customer)
    await queueCustomerMessage(
      tx,
      customer.phoneE164,
      'project_milestone',
      {
        customer: customer.name,
        project: project.code,
        milestone: `your system change is confirmed: ${formatKwp(next.capacityWp)}, new price ${formatInr(next.totalPaise)}`,
      },
      `project_change_accepted:${changeId}`,
    );
  if (project.managerUserId && project.managerUserId !== userId)
    await notify(
      tx,
      { userId: project.managerUserId },
      {
        kind: 'project_change',
        title: `${project.code}: change accepted`,
        body: message,
        subject: { type: 'project', id: project.id, projectId: project.id },
        dedupeKey: `project_change_accepted:${changeId}`,
      },
    );
}
