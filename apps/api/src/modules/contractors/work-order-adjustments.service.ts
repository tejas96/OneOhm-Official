import { Inject, Injectable } from '@nestjs/common';
import type { WorkOrderDetail } from '@oneohm/api-contracts';
import {
  contractors,
  payables,
  projectActivities,
  workOrderAdvances,
  workOrderLines,
  workOrderRework,
  workOrders,
  workOrderTasks,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { presentWorkOrder } from './work-order-read';
import { recalculateLines } from './work-order-sync';

const toRupee = (paise: number) => Math.round(paise / 100) * 100;

/** Changes to an open work order: extra lines, rework deductions and advances. */
@Injectable()
export class WorkOrderAdjustmentsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async addLine(
    actor: Actor,
    id: string,
    input: { description: string; quantityMilli: number; unitRatePaise: number },
  ): Promise<WorkOrderDetail> {
    await this.openOrder(id);
    const [last] = await this.db
      .select({ position: sql<number>`coalesce(max(${workOrderLines.position}), 0)::int` })
      .from(workOrderLines)
      .where(eq(workOrderLines.workOrderId, id));
    await this.db.insert(workOrderLines).values({
      workOrderId: id,
      basis: 'per_day',
      description: input.description,
      quantityMilli: input.quantityMilli,
      unitRatePaise: input.unitRatePaise,
      amountPaise: toRupee((input.unitRatePaise * input.quantityMilli) / 1000),
      manual: true,
      position: (last?.position ?? 0) + 1000,
    });
    await recalculateLines(this.db, id);
    await recordAudit(this.db, actor.userId, 'work_order.line_added', 'work_order', id, input);
    return presentWorkOrder(this.db, id);
  }

  async rework(
    actor: Actor,
    id: string,
    input: { taskId?: string | null | undefined; note: string; deductionPaise: number },
  ): Promise<WorkOrderDetail> {
    const order = await this.openOrder(id);
    if (input.taskId) {
      const [link] = await this.db
        .select()
        .from(workOrderTasks)
        .where(and(eq(workOrderTasks.workOrderId, id), eq(workOrderTasks.taskId, input.taskId)));
      if (!link) throw notFound('That task on this work order');
    }
    await this.db.transaction(async (tx) => {
      await tx.insert(workOrderRework).values({
        workOrderId: id,
        taskId: input.taskId ?? null,
        note: input.note,
        deductionPaise: input.deductionPaise,
        createdByUserId: actor.userId,
      });
      await tx.insert(projectActivities).values({
        projectId: order.projectId,
        taskId: input.taskId ?? null,
        kind: 'rework',
        message: `Rework on ${order.number}: ${input.note}`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'work_order.rework', 'work_order', id, {
        deductionPaise: input.deductionPaise,
      });
    });
    return presentWorkOrder(this.db, id);
  }

  async advance(
    actor: Actor,
    id: string,
    input: { amountPaise: number; note?: string | null | undefined },
  ): Promise<WorkOrderDetail> {
    const order = await this.openOrder(id);
    const [contractor] = await this.db
      .select()
      .from(contractors)
      .where(eq(contractors.id, order.contractorId));
    if (!contractor) throw notFound('That contractor');
    await this.db.transaction(async (tx) => {
      const [payable] = await tx
        .insert(payables)
        .values({
          projectId: order.projectId,
          party: 'contractor',
          partyName: contractor.name,
          description: `Advance · ${order.number}`,
          amountPaise: input.amountPaise,
          dueOn: todayIn(),
        })
        .returning({ id: payables.id });
      if (!payable) throw new Error('Payable insert returned nothing.');
      await tx.insert(workOrderAdvances).values({
        workOrderId: id,
        payableId: payable.id,
        amountPaise: input.amountPaise,
        note: input.note ?? null,
        createdByUserId: actor.userId,
      });
      await tx
        .update(workOrders)
        .set({ advancesPaise: sql`${workOrders.advancesPaise} + ${input.amountPaise}` })
        .where(eq(workOrders.id, id));
      await recordAudit(tx, actor.userId, 'work_order.advance', 'work_order', id, {
        amountPaise: input.amountPaise,
      });
    });
    return presentWorkOrder(this.db, id);
  }

  private async openOrder(id: string) {
    const [order] = await this.db.select().from(workOrders).where(eq(workOrders.id, id));
    if (!order) throw notFound('That work order');
    if (order.status !== 'open' && order.status !== 'in_progress')
      throw conflict('This work order is closed.', 'closed');
    return order;
  }
}
