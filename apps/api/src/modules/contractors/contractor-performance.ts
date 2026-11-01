import type { ContractorSummary } from '@oneohm/api-contracts';
import {
  contractorMembers,
  type DatabaseExecutor,
  payables,
  projectTasks,
  stageRatingPeople,
  workOrderAdvances,
  workOrderRework,
  workOrders,
  workOrderTasks,
} from '@oneohm/database';
import { ratingSummary } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { eq, inArray } from 'drizzle-orm';

type Performance = ContractorSummary['performance'];

const EMPTY: Performance = {
  completedWorkOrders: 0,
  openWorkOrders: 0,
  onTimePercent: null,
  reworkCount: 0,
  openTasks: 0,
  overdueTasks: 0,
  pendingPayablePaise: 0,
  paidPaise: 0,
};

/**
 * Delivery, quality and money per contractor (PRD 3.13): on-time share of finished
 * tasks, rework recorded, open and overdue work, and payables pending or paid.
 */
export async function contractorPerformance(
  db: DatabaseExecutor,
  contractorIds: readonly string[],
): Promise<Map<string, Performance>> {
  const result = new Map<string, Performance>(contractorIds.map((id) => [id, { ...EMPTY }]));
  if (contractorIds.length === 0) return result;
  await tallyRatings(db, result);
  const orders = await db
    .select()
    .from(workOrders)
    .where(inArray(workOrders.contractorId, [...contractorIds]));
  if (orders.length === 0) return result;
  const orderIds = orders.map((order) => order.id);
  const contractorOf = new Map(orders.map((order) => [order.id, order.contractorId]));

  const tasks = await db
    .select({
      workOrderId: workOrderTasks.workOrderId,
      status: projectTasks.status,
      dueDate: projectTasks.dueDate,
      completedAt: projectTasks.completedAt,
    })
    .from(workOrderTasks)
    .innerJoin(projectTasks, eq(projectTasks.id, workOrderTasks.taskId))
    .where(inArray(workOrderTasks.workOrderId, orderIds));
  const rework = await db
    .select({ workOrderId: workOrderRework.workOrderId })
    .from(workOrderRework)
    .where(inArray(workOrderRework.workOrderId, orderIds));
  const payableOwner = await payableOwners(db, orders, contractorOf);
  const money = payableOwner.size
    ? await db
        .select({ id: payables.id, status: payables.status, amount: payables.amountPaise })
        .from(payables)
        .where(inArray(payables.id, [...payableOwner.keys()]))
    : [];

  const today = todayIn();
  const entryFor = (workOrderId: string) => {
    const owner = contractorOf.get(workOrderId);
    return owner ? result.get(owner) : undefined;
  };
  for (const order of orders) tallyOrder(result.get(order.contractorId), order.status);
  const onTime = new Map<Performance, { done: number; inTime: number }>();
  for (const task of tasks) tallyTask(entryFor(task.workOrderId), task, today, onTime);
  for (const item of rework) {
    const entry = entryFor(item.workOrderId);
    if (entry) entry.reworkCount += 1;
  }
  for (const row of money) {
    const owner = payableOwner.get(row.id);
    tallyMoney(owner ? result.get(owner) : undefined, row);
  }
  for (const [entry, tally] of onTime) {
    if (tally.done > 0) entry.onTimePercent = Math.round((100 * tally.inTime) / tally.done);
  }
  return result;
}

/**
 * Customers' stars for the crew members on their stage work (PRD 5.7, Flow G), shown
 * only once three customers have rated, so one bad day does not decide it.
 */
async function tallyRatings(db: DatabaseExecutor, result: Map<string, Performance>) {
  const members = await db
    .select({ userId: contractorMembers.userId, contractorId: contractorMembers.contractorId })
    .from(contractorMembers)
    .where(inArray(contractorMembers.contractorId, [...result.keys()]));
  if (members.length === 0) return;
  const stars = await db
    .select({ userId: stageRatingPeople.userId, rating: stageRatingPeople.rating })
    .from(stageRatingPeople)
    .where(
      inArray(
        stageRatingPeople.userId,
        members.map((member) => member.userId),
      ),
    );
  for (const [contractorId, entry] of result) {
    const crew = new Set(
      members.filter((member) => member.contractorId === contractorId).map((m) => m.userId),
    );
    const summary = ratingSummary(
      stars.filter((row) => crew.has(row.userId)).map((row) => row.rating),
    );
    entry.rating = summary.average;
    entry.ratings = summary.count;
  }
}

function tallyOrder(entry: Performance | undefined, status: string): void {
  if (!entry) return;
  if (status === 'completed') entry.completedWorkOrders += 1;
  if (status === 'open' || status === 'in_progress') entry.openWorkOrders += 1;
}

function tallyTask(
  entry: Performance | undefined,
  task: { status: string; dueDate: string; completedAt: Date | null },
  today: string,
  onTime: Map<Performance, { done: number; inTime: number }>,
): void {
  if (!entry) return;
  if (task.status !== 'completed') {
    entry.openTasks += 1;
    if (task.dueDate < today) entry.overdueTasks += 1;
    return;
  }
  const tally = onTime.get(entry) ?? { done: 0, inTime: 0 };
  tally.done += 1;
  if ((task.completedAt?.toISOString().slice(0, 10) ?? today) <= task.dueDate) tally.inTime += 1;
  onTime.set(entry, tally);
}

function tallyMoney(entry: Performance | undefined, row: { status: string; amount: number }): void {
  if (!entry) return;
  if (row.status === 'paid') entry.paidPaise += row.amount;
  else entry.pendingPayablePaise += row.amount;
}

/** Which contractor each payable (settlement, retention or advance) belongs to. */
async function payableOwners(
  db: DatabaseExecutor,
  orders: readonly (typeof workOrders.$inferSelect)[],
  contractorOf: ReadonlyMap<string, string>,
): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  for (const order of orders) {
    if (order.payableId) owners.set(order.payableId, order.contractorId);
    if (order.retentionPayableId) owners.set(order.retentionPayableId, order.contractorId);
  }
  const advances = await db
    .select({ workOrderId: workOrderAdvances.workOrderId, payableId: workOrderAdvances.payableId })
    .from(workOrderAdvances)
    .where(inArray(workOrderAdvances.workOrderId, [...contractorOf.keys()]));
  for (const advance of advances) {
    const owner = contractorOf.get(advance.workOrderId);
    if (owner) owners.set(advance.payableId, owner);
  }
  return owners;
}
