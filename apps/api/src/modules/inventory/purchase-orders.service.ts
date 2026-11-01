import { Inject, Injectable } from '@nestjs/common';
import type {
  PurchaseOrderData,
  PurchaseOrderDetail,
  PurchaseOrderStatus,
  PurchaseOrderSummary,
} from '@oneohm/api-contracts';
import {
  products,
  projectActivities,
  projects,
  purchaseOrderLines,
  purchaseOrders,
  type Transaction,
  vendors,
} from '@oneohm/database';
import { purchaseOrderTotals } from '@oneohm/domain';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { purchaseOrderDetail, purchaseOrderSummaries } from './purchase-order-read';
import { nextNumber, suggestFacts } from './stock-ledger';

/** Purchase orders from draft to closed (PRD 3.10). Receiving lives in ReceivingService. */
@Injectable()
export class PurchaseOrdersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(filter: {
    status?: PurchaseOrderStatus | undefined;
    projectId?: string | undefined;
  }): Promise<PurchaseOrderSummary[]> {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(purchaseOrders.status, filter.status));
    if (filter.projectId) conditions.push(eq(purchaseOrders.projectId, filter.projectId));
    return purchaseOrderSummaries(this.db, conditions.length ? and(...conditions) : undefined);
  }

  get(id: string): Promise<PurchaseOrderDetail> {
    return purchaseOrderDetail(this.db, id);
  }

  async create(actor: Actor, input: PurchaseOrderData): Promise<PurchaseOrderDetail> {
    await checkOrderInput(this.db, input);
    const id = await this.db.transaction(async (tx) => (await insertOrder(tx, actor, input)).id);
    return this.get(id);
  }

  /** Sending fixes the order; for a project it fills the PO number and date facts. */
  async send(actor: Actor, id: string): Promise<PurchaseOrderDetail> {
    await this.db.transaction(async (tx) => {
      const order = await this.load(tx, id);
      if (order.status !== 'draft') throw conflict('Only a draft order can be sent.', 'not_draft');
      await tx
        .update(purchaseOrders)
        .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id));
      if (order.projectId) {
        await suggestFacts(tx, order.projectId, {
          purchase_order_number: order.number,
          purchase_order_date: order.orderDate,
        });
        await tx.insert(projectActivities).values({
          projectId: order.projectId,
          kind: 'material',
          message: `Purchase order ${order.number} sent.`,
          userId: actor.userId,
        });
      }
      await recordAudit(tx, actor.userId, 'purchase_order.sent', 'purchase_order', id);
    });
    return this.get(id);
  }

  async cancel(actor: Actor, id: string): Promise<PurchaseOrderDetail> {
    await this.db.transaction(async (tx) => {
      const order = await this.load(tx, id);
      if (order.status !== 'draft' && order.status !== 'sent') {
        throw conflict('Goods have arrived on this order; close it instead.', 'has_receipts');
      }
      await tx
        .update(purchaseOrders)
        .set({ status: 'cancelled', closedAt: new Date(), updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id));
      await recordAudit(tx, actor.userId, 'purchase_order.cancelled', 'purchase_order', id);
    });
    return this.get(id);
  }

  async close(actor: Actor, id: string): Promise<PurchaseOrderDetail> {
    await this.db.transaction(async (tx) => {
      const order = await this.load(tx, id);
      if (order.status !== 'partly_received') {
        throw conflict('Only a partly received order can be closed short.', 'not_partly_received');
      }
      await tx
        .update(purchaseOrders)
        .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id));
      await recordAudit(tx, actor.userId, 'purchase_order.closed', 'purchase_order', id);
    });
    return this.get(id);
  }

  private async load(tx: Pick<Database, 'select'>, id: string) {
    const [order] = await tx
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .for('update');
    if (!order) throw notFound('That purchase order');
    return order;
  }
}

/** The vendor, project, dates and products on a new order, checked before writing. */
export async function checkOrderInput(
  db: Pick<Database, 'select'>,
  input: PurchaseOrderData,
): Promise<void> {
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, input.vendorId));
  if (!vendor?.active) throw invalid('Pick an active vendor.', { vendorId: 'Pick a vendor.' });
  if (input.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, input.projectId));
    if (!project) throw invalid('That project was not found.', { projectId: 'Pick a project.' });
  }
  if (input.expectedOn && input.expectedOn < input.orderDate) {
    throw invalid('Delivery cannot be before the order.', {
      expectedOn: 'Pick a date on or after the order date.',
    });
  }
  const productIds = input.lines.flatMap((line) => (line.productId ? [line.productId] : []));
  if (productIds.length > 0) {
    const found = await db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, productIds));
    if (found.length !== new Set(productIds).size) throw invalid('A line has an unknown product.');
  }
}

/** Writes a checked order as a draft, in the caller's transaction. */
export async function insertOrder(
  tx: Transaction,
  actor: Actor,
  input: PurchaseOrderData,
): Promise<{ readonly id: string; readonly number: string }> {
  const totals = purchaseOrderTotals(input.lines);
  const number = await nextNumber(tx, 'purchase_orders', 'PO', input.orderDate);
  const [order] = await tx
    .insert(purchaseOrders)
    .values({
      number,
      vendorId: input.vendorId,
      projectId: input.projectId,
      orderDate: input.orderDate,
      expectedOn: input.expectedOn,
      notes: input.notes,
      subtotalPaise: totals.subtotalPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      createdByUserId: actor.userId,
    })
    .returning({ id: purchaseOrders.id });
  if (!order) throw new Error('Purchase order insert returned nothing.');
  await tx.insert(purchaseOrderLines).values(
    input.lines.map((line, index) => ({
      ...line,
      purchaseOrderId: order.id,
      position: index,
    })),
  );
  await recordAudit(tx, actor.userId, 'purchase_order.created', 'purchase_order', order.id, {
    number,
    total: totals.totalPaise,
  });
  return { id: order.id, number };
}
