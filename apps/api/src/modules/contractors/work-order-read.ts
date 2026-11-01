import type { WorkOrderDetail, WorkOrderSummary } from '@oneohm/api-contracts';
import {
  contractors,
  type DatabaseExecutor,
  payables,
  projects,
  projectTasks,
  users,
  workOrderAdvances,
  workOrderLines,
  workOrderRework,
  workOrders,
  workOrderTasks,
} from '@oneohm/database';
import { settleWorkOrder } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';

/** Work orders as list rows, newest first, with how many of their tasks are done. */
export async function workOrderSummaries(
  db: DatabaseExecutor,
  where: SQL | undefined,
): Promise<WorkOrderSummary[]> {
  const rows = await db
    .select({
      order: workOrders,
      contractorName: contractors.name,
      projectCode: projects.code,
      projectName: projects.name,
    })
    .from(workOrders)
    .innerJoin(contractors, eq(contractors.id, workOrders.contractorId))
    .innerJoin(projects, eq(projects.id, workOrders.projectId))
    .where(where)
    .orderBy(desc(workOrders.createdAt));
  const ids = rows.map((row) => row.order.id);
  const tasks = ids.length
    ? await db
        .select({ workOrderId: workOrderTasks.workOrderId, status: projectTasks.status })
        .from(workOrderTasks)
        .innerJoin(projectTasks, eq(projectTasks.id, workOrderTasks.taskId))
        .where(inArray(workOrderTasks.workOrderId, ids))
    : [];
  const today = todayIn();
  return rows.map(({ order, contractorName, projectCode, projectName }) => {
    const mine = tasks.filter((task) => task.workOrderId === order.id);
    const open = order.status === 'open' || order.status === 'in_progress';
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      contractor: { id: order.contractorId, name: contractorName },
      project: { id: order.projectId, code: projectCode, name: projectName },
      dueDate: order.dueDate,
      overdue: open && order.dueDate !== null && order.dueDate < today,
      taskCount: mine.length,
      tasksDone: mine.filter((task) => task.status === 'completed').length,
      grossPaise: order.grossPaise,
      netPayablePaise: order.netPayablePaise,
      createdAt: order.createdAt.toISOString(),
    };
  });
}

async function payableRef(db: DatabaseExecutor, id: string | null) {
  if (!id) return null;
  const [row] = await db.select().from(payables).where(eq(payables.id, id));
  return row
    ? { id: row.id, status: row.status, amountPaise: row.amountPaise, dueOn: row.dueOn }
    : null;
}

/** One work order with its lines, tasks, rework, advances and what it settles to. */
export async function presentWorkOrder(db: DatabaseExecutor, id: string): Promise<WorkOrderDetail> {
  const [summary] = await workOrderSummaries(db, eq(workOrders.id, id));
  const [order] = await db.select().from(workOrders).where(eq(workOrders.id, id));
  const [contractor] = order
    ? await db.select().from(contractors).where(eq(contractors.id, order.contractorId))
    : [];
  if (!summary || !order || !contractor) throw notFound('That work order');
  const lines = await db
    .select()
    .from(workOrderLines)
    .where(eq(workOrderLines.workOrderId, id))
    .orderBy(asc(workOrderLines.manual), asc(workOrderLines.position));
  const tasks = await db
    .select({ task: projectTasks, assigneeName: users.fullName })
    .from(workOrderTasks)
    .innerJoin(projectTasks, eq(projectTasks.id, workOrderTasks.taskId))
    .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .where(eq(workOrderTasks.workOrderId, id))
    .orderBy(asc(projectTasks.position));
  const rework = await db
    .select({ row: workOrderRework, taskTitle: projectTasks.title })
    .from(workOrderRework)
    .leftJoin(projectTasks, eq(projectTasks.id, workOrderRework.taskId))
    .where(eq(workOrderRework.workOrderId, id))
    .orderBy(desc(workOrderRework.createdAt));
  const advances = await db
    .select({ row: workOrderAdvances, status: payables.status })
    .from(workOrderAdvances)
    .innerJoin(payables, eq(payables.id, workOrderAdvances.payableId))
    .where(eq(workOrderAdvances.workOrderId, id))
    .orderBy(desc(workOrderAdvances.createdAt));
  const today = todayIn();
  const settled = order.status === 'completed';
  const settlement = settled
    ? {
        grossPaise: order.grossPaise,
        reworkDeductionsPaise: order.reworkDeductionsPaise,
        retentionPaise: order.retentionPaise,
        tdsPaise: order.tdsPaise,
        advancesPaise: order.advancesPaise,
        netPayablePaise: order.netPayablePaise,
      }
    : settleWorkOrder({
        lineAmountsPaise: lines.map((line) => line.amountPaise),
        reworkDeductionsPaise: rework.reduce((sum, item) => sum + item.row.deductionPaise, 0),
        advancesPaise: order.advancesPaise,
        retentionBp: contractor.retentionBp,
        tdsBp: contractor.tdsBp,
      });
  return {
    ...summary,
    scope: order.scope,
    startedAt: order.startedAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledReason: order.cancelledReason,
    lines: lines.map((line) => ({
      id: line.id,
      basis: line.basis,
      description: line.description,
      quantityMilli: line.quantityMilli,
      unitRatePaise: line.unitRatePaise,
      amountPaise: line.amountPaise,
      manual: line.manual,
    })),
    tasks: tasks.map(({ task, assigneeName }) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      overdue: task.status !== 'completed' && task.dueDate < today,
      assignee:
        task.assigneeUserId && assigneeName
          ? { id: task.assigneeUserId, fullName: assigneeName }
          : null,
      completedAt: task.completedAt?.toISOString() ?? null,
    })),
    rework: rework.map(({ row, taskTitle }) => ({
      id: row.id,
      taskTitle,
      note: row.note,
      deductionPaise: row.deductionPaise,
      createdAt: row.createdAt.toISOString(),
    })),
    advances: advances.map(({ row, status }) => ({
      id: row.id,
      amountPaise: row.amountPaise,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      payableStatus: status,
    })),
    settlement,
    payable: await payableRef(db, order.payableId),
    retentionPayable: await payableRef(db, order.retentionPayableId),
  };
}
