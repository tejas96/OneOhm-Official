import {
  contractorMembers,
  contractorRates,
  type DatabaseExecutor,
  projects,
  projectTasks,
  workOrderLines,
  workOrders,
  workOrderTasks,
} from '@oneohm/database';
import { type ContractorRate, type ProjectType, workOrderLines as rateLines } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, inArray, like, ne, sql } from 'drizzle-orm';
import { settleIfDone } from './work-order-settle';

const OPEN = ['open', 'in_progress'] as const;

/** Next work order number for this year (India time); serialised so two never clash. */
async function nextNumber(db: DatabaseExecutor): Promise<string> {
  const year = todayIn().slice(0, 4);
  await db.execute(sql`select pg_advisory_xact_lock(hashtext('oneohm:work_order'))`);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(like(workOrders.number, `WO-${year}-%`));
  return `WO-${year}-${String((row?.count ?? 0) + 1).padStart(4, '0')}`;
}

/** Rate lines recalculated from the rate card; lines added by hand stay. */
export async function recalculateLines(db: DatabaseExecutor, workOrderId: string): Promise<void> {
  const [order] = await db
    .select({
      contractorId: workOrders.contractorId,
      capacityWp: projects.capacityWp,
      type: projects.type,
    })
    .from(workOrders)
    .innerJoin(projects, eq(projects.id, workOrders.projectId))
    .where(eq(workOrders.id, workOrderId));
  if (!order) return;
  const rates = await db
    .select()
    .from(contractorRates)
    .where(
      and(eq(contractorRates.contractorId, order.contractorId), eq(contractorRates.active, true)),
    );
  const tasks = await db
    .select({ templateKey: projectTasks.templateKey, title: projectTasks.title })
    .from(workOrderTasks)
    .innerJoin(projectTasks, eq(projectTasks.id, workOrderTasks.taskId))
    .where(eq(workOrderTasks.workOrderId, workOrderId))
    .orderBy(asc(projectTasks.position));
  const drafts = rateLines({
    rates: rates.map(
      (rate): ContractorRate => ({
        id: rate.id,
        basis: rate.basis,
        taskKey: rate.taskKey,
        projectType: rate.projectType as ProjectType | null,
        label: rate.label,
        amountPaise: rate.amountPaise,
      }),
    ),
    tasks,
    capacityWp: order.capacityWp,
    projectType: order.type as ProjectType,
  });
  await db
    .delete(workOrderLines)
    .where(and(eq(workOrderLines.workOrderId, workOrderId), eq(workOrderLines.manual, false)));
  const manual = await db
    .select({ amount: workOrderLines.amountPaise })
    .from(workOrderLines)
    .where(eq(workOrderLines.workOrderId, workOrderId));
  if (drafts.length > 0) {
    await db
      .insert(workOrderLines)
      .values(
        drafts.map((draft, position) => ({ ...draft, workOrderId, manual: false, position })),
      );
  }
  const gross =
    drafts.reduce((sum, line) => sum + line.amountPaise, 0) +
    manual.reduce((sum, line) => sum + line.amount, 0);
  await db
    .update(workOrders)
    .set({ grossPaise: gross, updatedAt: new Date() })
    .where(eq(workOrders.id, workOrderId));
}

/**
 * Keeps work orders in step with who the project's tasks are assigned to (PRD 3.13):
 * a task given to a contractor's crew joins that contractor's open work order on the
 * project (created if needed); an unfinished task moved away leaves it.
 */
export async function syncWorkOrders(
  db: DatabaseExecutor,
  projectId: string,
  actorUserId: string | null,
): Promise<void> {
  const crewTasks = await db
    .select({
      taskId: projectTasks.id,
      status: projectTasks.status,
      dueDate: projectTasks.dueDate,
      contractorId: contractorMembers.contractorId,
    })
    .from(projectTasks)
    .innerJoin(contractorMembers, eq(contractorMembers.userId, projectTasks.assigneeUserId))
    .where(eq(projectTasks.projectId, projectId));
  const openOrders = await db
    .select({ id: workOrders.id, contractorId: workOrders.contractorId })
    .from(workOrders)
    .where(and(eq(workOrders.projectId, projectId), inArray(workOrders.status, [...OPEN])));

  const touched = new Set<string>();
  for (const order of openOrders) {
    const keep = crewTasks
      .filter((task) => task.contractorId === order.contractorId)
      .map((task) => task.taskId);
    const linked = await db
      .select({ taskId: workOrderTasks.taskId, status: projectTasks.status })
      .from(workOrderTasks)
      .innerJoin(projectTasks, eq(projectTasks.id, workOrderTasks.taskId))
      .where(eq(workOrderTasks.workOrderId, order.id));
    const leaving = linked
      .filter((link) => !keep.includes(link.taskId) && link.status !== 'completed')
      .map((link) => link.taskId);
    if (leaving.length > 0) {
      await db
        .delete(workOrderTasks)
        .where(
          and(eq(workOrderTasks.workOrderId, order.id), inArray(workOrderTasks.taskId, leaving)),
        );
      touched.add(order.id);
    }
  }

  const byContractor = new Map<string, typeof crewTasks>();
  for (const task of crewTasks) {
    byContractor.set(task.contractorId, [...(byContractor.get(task.contractorId) ?? []), task]);
  }
  for (const [contractorId, tasks] of byContractor) {
    let orderId = openOrders.find((order) => order.contractorId === contractorId)?.id;
    const unlinked = await db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .leftJoin(workOrderTasks, eq(workOrderTasks.taskId, projectTasks.id))
      .where(
        and(
          inArray(
            projectTasks.id,
            tasks.map((task) => task.taskId),
          ),
          sql`${workOrderTasks.taskId} is null`,
          ne(projectTasks.status, 'completed'),
        ),
      );
    if (unlinked.length === 0) continue;
    if (!orderId) {
      const dueDate =
        tasks
          .map((task) => task.dueDate)
          .sort()
          .at(-1) ?? null;
      const [created] = await db
        .insert(workOrders)
        .values({
          number: await nextNumber(db),
          contractorId,
          projectId,
          dueDate,
          createdByUserId: actorUserId,
        })
        .returning({ id: workOrders.id });
      orderId = created?.id;
    }
    if (!orderId) continue;
    await db
      .insert(workOrderTasks)
      .values(unlinked.map((task) => ({ workOrderId: orderId, taskId: task.id })))
      .onConflictDoNothing();
    touched.add(orderId);
  }

  for (const orderId of touched) {
    await recalculateLines(db, orderId);
    if (actorUserId) await settleIfDone(db, orderId, actorUserId);
  }
}
