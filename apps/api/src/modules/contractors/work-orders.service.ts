import { Inject, Injectable } from '@nestjs/common';
import type { WorkOrderDetail, WorkOrderSummary } from '@oneohm/api-contracts';
import {
  contractorMembers,
  contractors,
  projectActivities,
  projects,
  projectTasks,
  workOrders,
  workOrderTasks,
} from '@oneohm/database';
import { and, desc, eq, inArray, ne, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { presentWorkOrder, workOrderSummaries } from './work-order-read';
import { syncWorkOrders } from './work-order-sync';

@Injectable()
export class WorkOrdersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Managers see every work order; crew members only their own contractor's. */
  async list(
    actor: Actor,
    query: {
      status?: string | undefined;
      contractorId?: string | undefined;
      projectId?: string | undefined;
    },
  ): Promise<WorkOrderSummary[]> {
    const filters: SQL[] = [];
    const own = await this.scope(actor);
    if (own) filters.push(eq(workOrders.contractorId, own));
    if (query.contractorId) filters.push(eq(workOrders.contractorId, query.contractorId));
    if (query.projectId) filters.push(eq(workOrders.projectId, query.projectId));
    if (query.status)
      filters.push(
        eq(workOrders.status, query.status as (typeof workOrders.$inferSelect)['status']),
      );
    return workOrderSummaries(this.db, filters.length ? and(...filters) : undefined);
  }

  async get(actor: Actor, id: string): Promise<WorkOrderDetail> {
    const own = await this.scope(actor);
    const order = await presentWorkOrder(this.db, id);
    if (own && order.contractor.id !== own) throw notFound('That work order');
    return order;
  }

  /** Gives the project's open tasks in the contractor's skills to its crew lead. */
  async issue(
    actor: Actor,
    contractorId: string,
    input: {
      projectId: string;
      dueDate?: string | null | undefined;
      scope?: string | null | undefined;
    },
  ): Promise<WorkOrderDetail> {
    const [contractor] = await this.db
      .select()
      .from(contractors)
      .where(eq(contractors.id, contractorId));
    if (!contractor) throw notFound('That contractor');
    if (!contractor.active) throw conflict('This contractor is archived.', 'inactive');
    const crew = await this.db
      .select({ userId: contractorMembers.userId, lead: contractorMembers.lead })
      .from(contractorMembers)
      .where(eq(contractorMembers.contractorId, contractorId))
      .orderBy(desc(contractorMembers.lead));
    const lead = crew[0];
    if (!lead) throw conflict('Add a crew member to this contractor first.', 'no_crew');
    const [project] = await this.db.select().from(projects).where(eq(projects.id, input.projectId));
    if (!project) throw notFound('That project');
    const tasks = await this.db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.projectId, project.id),
          ne(projectTasks.status, 'completed'),
          inArray(projectTasks.roleKey, contractor.skills),
        ),
      );
    if (tasks.length === 0)
      throw conflict(
        "This project has no open tasks for this contractor's kind of work.",
        'no_tasks',
      );

    const workOrderId = await this.db.transaction(async (tx) => {
      await tx
        .update(projectTasks)
        .set({ assigneeUserId: lead.userId, updatedAt: new Date() })
        .where(
          inArray(
            projectTasks.id,
            tasks.map((task) => task.id),
          ),
        );
      await syncWorkOrders(tx, project.id, actor.userId);
      const [order] = await tx
        .select({ id: workOrders.id, number: workOrders.number })
        .from(workOrders)
        .where(
          and(
            eq(workOrders.contractorId, contractorId),
            eq(workOrders.projectId, project.id),
            inArray(workOrders.status, ['open', 'in_progress']),
          ),
        );
      if (!order) throw conflict('The work order could not be created.', 'not_created');
      await tx
        .update(workOrders)
        .set({
          ...(input.dueDate ? { dueDate: input.dueDate } : {}),
          ...(input.scope ? { scope: input.scope } : {}),
          updatedAt: new Date(),
        })
        .where(eq(workOrders.id, order.id));
      await tx.insert(projectActivities).values({
        projectId: project.id,
        kind: 'work_order_issued',
        message: `Work order ${order.number} issued to ${contractor.name} (${tasks.length} tasks).`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'work_order.issued', 'work_order', order.id, {
        contractorId,
        tasks: tasks.length,
      });
      return order.id;
    });
    return presentWorkOrder(this.db, workOrderId);
  }

  /** Cancelling frees the tasks; reassign them to whoever takes the work over. */
  async cancel(actor: Actor, id: string, reason: string): Promise<WorkOrderDetail> {
    await this.openOrder(id);
    await this.db.transaction(async (tx) => {
      await tx.delete(workOrderTasks).where(eq(workOrderTasks.workOrderId, id));
      await tx
        .update(workOrders)
        .set({ status: 'cancelled', cancelledReason: reason, updatedAt: new Date() })
        .where(eq(workOrders.id, id));
      await recordAudit(tx, actor.userId, 'work_order.cancelled', 'work_order', id, { reason });
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

  /** The contractor a crew member may see, or null for managers who see everything. */
  private async scope(actor: Actor): Promise<string | null> {
    if (can(actor, 'contractors.manage')) return null;
    if (!can(actor, 'work_orders.view_own')) throw forbidden();
    const [member] = await this.db
      .select({ contractorId: contractorMembers.contractorId })
      .from(contractorMembers)
      .where(eq(contractorMembers.userId, actor.userId));
    if (!member) throw forbidden('You are not part of a contractor crew.');
    return member.contractorId;
  }
}
