import {
  type customers,
  type products,
  projects,
  projectTasks,
  type properties,
  type quotations,
  readBusinessSetting,
  type Transaction,
  taskDependencies,
} from '@oneohm/database';
import {
  type AssigneeCandidate,
  type Assignment,
  type GeneratedTask,
  type ProjectPool,
  pickProjectAssignee,
} from '@oneohm/domain';
import { like, sql } from 'drizzle-orm';

type Customer = typeof customers.$inferSelect;
type Property = typeof properties.$inferSelect;
type Quotation = typeof quotations.$inferSelect;
type Product = typeof products.$inferSelect;

const productName = (product: Product) =>
  `${product.brand === 'Starter catalog' ? '' : `${product.brand} `}${product.name}`;

export interface InverterProduct {
  readonly product: Product;
  readonly quantity: number;
}

/**
 * Inverter facts for DISCOM forms and reports: every model with its count
 * ("Brand 5 kW × 2, Brand 3 kW") and the total AC rating in kW.
 */
export function inverterFacts(
  inverters: readonly InverterProduct[],
): Pick<Record<string, string>, 'inverter_make' | 'inverter_total_kw'> {
  const totalW = inverters.reduce(
    (sum, { product, quantity }) => sum + (product.ratedW ?? 0) * quantity,
    0,
  );
  return {
    inverter_make: inverters
      .map(({ product, quantity }) =>
        quantity > 1 ? `${productName(product)} × ${quantity}` : productName(product),
      )
      .join(', '),
    inverter_total_kw: String(totalW / 1000),
  };
}

/** Report facts known at creation, from the customer, property and accepted quotation. */
export function initialFacts(
  customer: Customer,
  property: Property,
  quotation: Quotation,
  panel: Product,
  inverters: readonly InverterProduct[],
  startDate: string,
): Record<string, string> {
  const facts: Record<string, string> = {
    consumer_name: customer.name,
    consumer_phone: customer.phoneE164,
    consumer_email: customer.email ?? '',
    site_address: `${property.addressLine}, ${property.city}`,
    site_city: property.district,
    site_state: property.state,
    installed_capacity_kw: String(quotation.capacityWp / 1000),
    module_count: String(quotation.moduleCount),
    module_wattage: String(panel.wattageWp ?? ''),
    module_total_kw: String(quotation.capacityWp / 1000),
    module_make: productName(panel),
    ...inverterFacts(inverters),
    system_cost: String(quotation.totalPaise),
    project_onboarded_date: startDate,
    consumer_number: property.consumerNumber ?? '',
    sanctioned_capacity_kw: property.sanctionedLoadW ? String(property.sanctionedLoadW / 1000) : '',
  };
  return Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== ''));
}

/** One generated task as a row: a critical task's pick is only a proposal (PRD 3.8). */
export function taskValues(
  projectId: string,
  task: GeneratedTask,
  position: number,
  picked: Assignment,
  proposed: boolean,
): typeof projectTasks.$inferInsert {
  return {
    projectId,
    templateKey: task.key,
    title: task.title,
    description: task.description ?? null,
    stage: task.stage,
    roleKey: task.roleKey,
    assigneeUserId: proposed ? null : picked.userId,
    proposedUserId: proposed ? picked.userId : null,
    outsideTeam: picked.outsideTeam,
    status: task.dependsOn.length === 0 ? 'ready' : 'pending',
    waitingParty: task.waitingParty,
    startDate: task.startDate,
    dueDate: task.dueDate,
    customerVisible: task.customerVisible,
    notifyCustomer: task.notifyCustomer,
    approval: task.approval,
    reviewer: task.reviewer ?? 'approvers',
    evidence: [...task.evidence],
    captures: [...task.captures],
    checklist: task.checklist ? [...task.checklist] : null,
    onComplete: task.onComplete ?? null,
    reports: [...(task.reports ?? [])],
    position,
  };
}

/**
 * Writes the generated tasks: each to the right person in the project's pool (crew work
 * to its one contractor, the rest to its team first), counting load as work is handed
 * out so it spreads. Critical tasks only get a proposed person until a manager confirms.
 */
export async function writeGeneratedTasks(
  tx: Transaction,
  projectId: string,
  generated: readonly GeneratedTask[],
  candidates: AssigneeCandidate[],
  pool: ProjectPool,
): Promise<{ unassigned: number; toConfirm: number; perPerson: Map<string, number> }> {
  const ids = new Map<string, string>();
  const load = new Map(candidates.map((candidate) => [candidate.userId, candidate.openTasks]));
  // Round robin moves each person to the back of the queue as they get work (PRD 7.2).
  const turn = new Map(candidates.map((candidate) => [candidate.userId, candidate.lastAssignedAt]));
  const rules = await readBusinessSetting(tx, 'assignment');
  const now = Date.now();
  const perPerson = new Map<string, number>();
  let unassigned = 0;
  let toConfirm = 0;
  for (const [position, task] of generated.entries()) {
    const picked = pickProjectAssignee(
      candidates.map((candidate) => ({
        ...candidate,
        openTasks: load.get(candidate.userId) ?? 0,
        lastAssignedAt: turn.get(candidate.userId) ?? null,
      })),
      pool,
      task,
      rules,
    );
    const proposed = task.confirmAssignee === true;
    if (!picked.userId) unassigned += 1;
    else {
      load.set(picked.userId, (load.get(picked.userId) ?? 0) + 1);
      turn.set(picked.userId, new Date(now + position).toISOString());
      if (proposed) toConfirm += 1;
      else perPerson.set(picked.userId, (perPerson.get(picked.userId) ?? 0) + 1);
    }
    const [row] = await tx
      .insert(projectTasks)
      .values(taskValues(projectId, task, position, picked, proposed))
      .returning({ id: projectTasks.id });
    if (!row) throw new Error('Task insert returned nothing.');
    ids.set(task.key, row.id);
  }
  const links = generated.flatMap((task) =>
    task.dependsOn.flatMap((key) => {
      const taskId = ids.get(task.key);
      const dependsOnTaskId = ids.get(key);
      return taskId && dependsOnTaskId ? [{ taskId, dependsOnTaskId }] : [];
    }),
  );
  if (links.length > 0) await tx.insert(taskDependencies).values(links);
  return { unassigned, toConfirm, perPerson };
}

/** The next OH-YYYY-NNN code for the year. */
export async function nextCode(tx: Transaction, year: string): Promise<string> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(like(projects.code, `OH-${year}-%`));
  return `OH-${year}-${String((row?.count ?? 0) + 1).padStart(3, '0')}`;
}

/** "Project created from Q-… with 31 tasks, 2 waiting for someone to be assigned." */
export function createdMessage(
  quotation: string,
  tasks: number,
  unassigned: number,
  toConfirm: number,
): string {
  const waiting = [
    unassigned ? `${unassigned} waiting for someone to be assigned` : '',
    toConfirm ? `${toConfirm} for a manager to confirm who does them` : '',
  ].filter(Boolean);
  return `Project created from ${quotation} with ${tasks} tasks${waiting.length ? `, ${waiting.join(' and ')}` : ''}.`;
}
