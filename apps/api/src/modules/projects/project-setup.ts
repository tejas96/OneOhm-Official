import {
  type customers,
  type products,
  projectTasks,
  type properties,
  type quotations,
  type Transaction,
  taskDependencies,
} from '@oneohm/database';
import { type AssigneeCandidate, type GeneratedTask, pickAssignee } from '@oneohm/domain';

type Customer = typeof customers.$inferSelect;
type Property = typeof properties.$inferSelect;
type Quotation = typeof quotations.$inferSelect;
type Product = typeof products.$inferSelect;

const productName = (product: Product) =>
  `${product.brand === 'Starter catalog' ? '' : `${product.brand} `}${product.name}`;

/** Report facts known at creation, from the customer, property and accepted quotation. */
export function initialFacts(
  customer: Customer,
  property: Property,
  quotation: Quotation,
  panel: Product,
  inverter: Product,
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
    inverter_make: productName(inverter),
    inverter_total_kw: String((inverter.ratedW ?? 0) / 1000),
    system_cost: String(quotation.totalPaise),
    project_onboarded_date: startDate,
    consumer_number: property.consumerNumber ?? '',
    sanctioned_capacity_kw: property.sanctionedLoadW ? String(property.sanctionedLoadW / 1000) : '',
  };
  return Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== ''));
}

/**
 * Writes the generated tasks: each to the least-loaded available person in its role
 * (load is counted as tasks are handed out, so work spreads), then the dependencies.
 */
export async function writeGeneratedTasks(
  tx: Transaction,
  projectId: string,
  generated: readonly GeneratedTask[],
  candidates: AssigneeCandidate[],
): Promise<{ unassigned: number }> {
  const ids = new Map<string, string>();
  const load = new Map(candidates.map((candidate) => [candidate.userId, candidate.openTasks]));
  let unassigned = 0;
  for (const [position, task] of generated.entries()) {
    const assignee = pickAssignee(
      candidates.map((candidate) => ({ ...candidate, openTasks: load.get(candidate.userId) ?? 0 })),
      task.roleKey,
    );
    if (assignee) load.set(assignee.userId, (load.get(assignee.userId) ?? 0) + 1);
    else unassigned += 1;
    const [row] = await tx
      .insert(projectTasks)
      .values({
        projectId,
        templateKey: task.key,
        title: task.title,
        stage: task.stage,
        roleKey: task.roleKey,
        assigneeUserId: assignee?.userId ?? null,
        status: task.dependsOn.length === 0 ? 'ready' : 'pending',
        waitingParty: task.waitingParty,
        startDate: task.startDate,
        dueDate: task.dueDate,
        customerVisible: task.customerVisible,
        notifyCustomer: task.notifyCustomer,
        approval: task.approval,
        evidence: [...task.evidence],
        captures: [...task.captures],
        onComplete: task.onComplete ?? null,
        reports: [...(task.reports ?? [])],
        position,
      })
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
  return { unassigned };
}
