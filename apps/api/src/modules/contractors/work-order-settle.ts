import {
  contractorMembers,
  contractors,
  type DatabaseExecutor,
  payables,
  postWorkOrderTds,
  projectActivities,
  projects,
  projectTasks,
  workOrderLines,
  workOrderRework,
  workOrders,
  workOrderTasks,
} from '@oneohm/database';
import { settleWorkOrder } from '@oneohm/domain';
import { addDays, formatInr, todayIn } from '@oneohm/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';

/** Rework deductions recorded on a work order so far. */
export async function reworkTotal(db: DatabaseExecutor, workOrderId: string): Promise<number> {
  const rows = await db
    .select({ amount: workOrderRework.deductionPaise })
    .from(workOrderRework)
    .where(eq(workOrderRework.workOrderId, workOrderId));
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

/**
 * When every task on a work order is done, the order settles (PRD 3.13): a contractor
 * payable for the net amount, due after the contractor's payment terms, and a second
 * payable for any retention, due when the defect period ends.
 */
export async function settleIfDone(
  db: DatabaseExecutor,
  workOrderId: string,
  userId: string,
): Promise<void> {
  const [order] = await db
    .select({
      order: workOrders,
      contractor: contractors,
      projectCode: projects.code,
    })
    .from(workOrders)
    .innerJoin(contractors, eq(contractors.id, workOrders.contractorId))
    .innerJoin(projects, eq(projects.id, workOrders.projectId))
    .where(eq(workOrders.id, workOrderId))
    // Two tasks finishing together must not settle the same order twice.
    .for('update', { of: workOrders });
  if (!order || !['open', 'in_progress'].includes(order.order.status)) return;
  const tasks = await db
    .select({ status: projectTasks.status })
    .from(workOrderTasks)
    .innerJoin(projectTasks, eq(projectTasks.id, workOrderTasks.taskId))
    .where(eq(workOrderTasks.workOrderId, workOrderId));
  if (tasks.length === 0) return;
  const now = new Date();
  const started = tasks.some((task) => task.status !== 'pending' && task.status !== 'ready');
  if (tasks.some((task) => task.status !== 'completed')) {
    if (started && order.order.status === 'open') {
      await db
        .update(workOrders)
        .set({ status: 'in_progress', startedAt: now, updatedAt: now })
        .where(eq(workOrders.id, workOrderId));
    }
    return;
  }

  const lines = await db
    .select({ amount: workOrderLines.amountPaise })
    .from(workOrderLines)
    .where(eq(workOrderLines.workOrderId, workOrderId));
  const settlement = settleWorkOrder({
    lineAmountsPaise: lines.map((line) => line.amount),
    reworkDeductionsPaise: await reworkTotal(db, workOrderId),
    advancesPaise: order.order.advancesPaise,
    retentionBp: order.contractor.retentionBp,
    tdsBp: order.contractor.tdsBp,
  });
  const [lead] = await db
    .select({ userId: contractorMembers.userId })
    .from(contractorMembers)
    .where(
      and(
        eq(contractorMembers.contractorId, order.contractor.id),
        eq(contractorMembers.lead, true),
      ),
    )
    .limit(1);
  const today = todayIn();
  const base = {
    projectId: order.order.projectId,
    party: 'contractor' as const,
    partyName: order.contractor.name,
    partyUserId: lead?.userId ?? null,
  };
  const [payable] =
    settlement.netPayablePaise > 0
      ? await db
          .insert(payables)
          .values({
            ...base,
            description: `Work order ${order.order.number} · ${order.projectCode}`,
            amountPaise: settlement.netPayablePaise,
            dueOn: addDays(today, order.contractor.paymentTermsDays),
          })
          .returning({ id: payables.id })
      : [];
  const [retention] =
    settlement.retentionPaise > 0
      ? await db
          .insert(payables)
          .values({
            ...base,
            description: `Retention release · ${order.order.number}`,
            amountPaise: settlement.retentionPaise,
            dueOn: addDays(today, order.contractor.retentionDays),
          })
          .returning({ id: payables.id })
      : [];
  await db
    .update(workOrders)
    .set({
      status: 'completed',
      startedAt: order.order.startedAt ?? now,
      completedAt: now,
      grossPaise: settlement.grossPaise,
      reworkDeductionsPaise: settlement.reworkDeductionsPaise,
      retentionPaise: settlement.retentionPaise,
      tdsPaise: settlement.tdsPaise,
      netPayablePaise: settlement.netPayablePaise,
      payableId: payable?.id ?? null,
      retentionPayableId: retention?.id ?? null,
      updatedAt: now,
    })
    .where(eq(workOrders.id, workOrderId));
  await postWorkOrderTds(db, workOrderId, userId);
  await db.insert(projectActivities).values({
    projectId: order.order.projectId,
    kind: 'work_order_completed',
    message: `Work order ${order.order.number} done: ${formatInr(settlement.netPayablePaise)} payable to ${order.contractor.name}.`,
    userId,
  });
  await recordAudit(db, userId, 'work_order.settled', 'work_order', workOrderId, {
    ...settlement,
  });
}

/** Called when a task finishes: settles the work order it belongs to, if any. */
export async function settleWorkOrderForTask(
  db: DatabaseExecutor,
  taskId: string,
  userId: string,
): Promise<void> {
  const links = await db
    .select({ workOrderId: workOrderTasks.workOrderId })
    .from(workOrderTasks)
    .where(inArray(workOrderTasks.taskId, [taskId]));
  for (const link of links) await settleIfDone(db, link.workOrderId, userId);
}
