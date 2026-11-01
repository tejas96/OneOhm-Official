import { Inject, Injectable } from '@nestjs/common';
import type { CrewFeedback, CrewPayable, CrewPayments } from '@oneohm/api-contracts';
import {
  customerFeedback,
  payables,
  projects,
  projectTasks,
  workOrderAdvances,
  workOrderRework,
  workOrders,
} from '@oneohm/database';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { DATABASE, type Database } from '../../config/core.module';
import { contractorPerformance } from './contractor-performance';
import { crewContractor } from './crew-scope';

type PayableRow = typeof payables.$inferSelect;

/**
 * What a crew sees about its own contractor (PRD 4.9): payables raised for its work
 * orders and how they were paid, customer ratings and rework on its jobs. Built only from
 * the contractor's own work orders, so other contractors and project prices never show.
 */
@Injectable()
export class CrewPortalService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private orders(contractorId: string) {
    return this.db
      .select({ order: workOrders, projectCode: projects.code, projectName: projects.name })
      .from(workOrders)
      .innerJoin(projects, eq(projects.id, workOrders.projectId))
      .where(and(eq(workOrders.contractorId, contractorId), ne(workOrders.status, 'cancelled')))
      .orderBy(desc(workOrders.createdAt));
  }

  async payments(actor: Actor): Promise<CrewPayments> {
    const contractor = await crewContractor(this.db, actor);
    const orders = await this.orders(contractor.id);
    const advances = orders.length
      ? await this.db
          .select({
            workOrderId: workOrderAdvances.workOrderId,
            payableId: workOrderAdvances.payableId,
          })
          .from(workOrderAdvances)
          .where(
            inArray(
              workOrderAdvances.workOrderId,
              orders.map((row) => row.order.id),
            ),
          )
      : [];
    const links: { payableId: string; kind: CrewPayable['kind']; orderId: string }[] = [
      ...orders.flatMap(({ order }) => [
        ...(order.payableId
          ? [{ payableId: order.payableId, kind: 'work_order' as const, orderId: order.id }]
          : []),
        ...(order.retentionPayableId
          ? [{ payableId: order.retentionPayableId, kind: 'retention' as const, orderId: order.id }]
          : []),
      ]),
      ...advances.map((row) => ({
        payableId: row.payableId,
        kind: 'advance' as const,
        orderId: row.workOrderId,
      })),
    ];
    const rows = links.length
      ? await this.db
          .select()
          .from(payables)
          .where(
            inArray(
              payables.id,
              links.map((link) => link.payableId),
            ),
          )
      : [];
    const list = links
      .flatMap((link) => {
        const payable = rows.find((row) => row.id === link.payableId);
        const order = orders.find((row) => row.order.id === link.orderId);
        return payable && order ? [present(payable, link.kind, order)] : [];
      })
      .sort((a, b) => b.dueOn.localeCompare(a.dueOn));
    const total = (status: CrewPayable['status']) =>
      list.filter((row) => row.status === status).reduce((sum, row) => sum + row.amountPaise, 0);
    return {
      contractor,
      awaitingApprovalPaise: total('pending'),
      approvedPaise: total('approved'),
      paidPaise: total('paid'),
      payables: list,
    };
  }

  async feedback(actor: Actor): Promise<CrewFeedback> {
    const contractor = await crewContractor(this.db, actor);
    const orders = await this.orders(contractor.id);
    const performance = (await contractorPerformance(this.db, [contractor.id])).get(contractor.id);
    const projectIds = [...new Set(orders.map((row) => row.order.projectId))];
    const ratings = projectIds.length
      ? await this.db
          .select({
            projectCode: projects.code,
            projectName: projects.name,
            rating: customerFeedback.rating,
            createdAt: customerFeedback.createdAt,
          })
          .from(customerFeedback)
          .innerJoin(projects, eq(projects.id, customerFeedback.projectId))
          .where(inArray(customerFeedback.projectId, projectIds))
          .orderBy(desc(customerFeedback.createdAt))
      : [];
    const rework = orders.length
      ? await this.db
          .select({
            row: workOrderRework,
            taskTitle: projectTasks.title,
            number: workOrders.number,
            projectCode: projects.code,
          })
          .from(workOrderRework)
          .innerJoin(workOrders, eq(workOrders.id, workOrderRework.workOrderId))
          .innerJoin(projects, eq(projects.id, workOrders.projectId))
          .leftJoin(projectTasks, eq(projectTasks.id, workOrderRework.taskId))
          .where(eq(workOrders.contractorId, contractor.id))
          .orderBy(desc(workOrderRework.createdAt))
      : [];
    const average = ratings.length
      ? Math.round((ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length) * 10) / 10
      : null;
    return {
      completedWorkOrders: performance?.completedWorkOrders ?? 0,
      onTimePercent: performance?.onTimePercent ?? null,
      averageRating: average,
      ratings: ratings.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      rework: rework.map(({ row, taskTitle, number, projectCode }) => ({
        id: row.id,
        workOrderNumber: number,
        projectCode,
        taskTitle,
        note: row.note,
        deductionPaise: row.deductionPaise,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}

function present(
  payable: PayableRow,
  kind: CrewPayable['kind'],
  order: { order: typeof workOrders.$inferSelect; projectCode: string; projectName: string },
): CrewPayable {
  return {
    id: payable.id,
    kind,
    workOrderNumber: order.order.number,
    project: { code: order.projectCode, name: order.projectName },
    amountPaise: payable.amountPaise,
    status: payable.status,
    dueOn: payable.dueOn,
    approvedAt: payable.approvedAt?.toISOString() ?? null,
    paidOn: payable.paidOn,
    paidMethod: payable.paidMethod,
  };
}
