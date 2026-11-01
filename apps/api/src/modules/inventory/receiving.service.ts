import { Inject, Injectable } from '@nestjs/common';
import type { PurchaseOrderDetail, ReceiptData } from '@oneohm/api-contracts';
import {
  goodsReceiptLines,
  goodsReceipts,
  notifyHolders,
  payables,
  projectActivities,
  purchaseOrderLines,
  purchaseOrders,
  stockSerials,
  type Transaction,
  vendors,
} from '@oneohm/database';
import { receiptStage } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { lineTotal, purchaseOrderDetail } from './purchase-order-read';
import { type CheckedLine, loadLines, validateReceipt } from './receipt-checks';
import { moveStock, nextNumber, resolveLocation } from './stock-ledger';

/**
 * Goods receipt (PRD 3.10): stock and serials come in, the order moves on, and the
 * vendor's bill is raised as a payable due after the vendor's payment terms.
 */
@Injectable()
export class ReceivingService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async receive(actor: Actor, orderId: string, input: ReceiptData): Promise<PurchaseOrderDetail> {
    await this.db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, orderId))
        .for('update');
      if (!order) throw notFound('That purchase order');
      if (order.status !== 'sent' && order.status !== 'partly_received') {
        throw conflict('Goods can be received only on a sent order.', 'not_receivable');
      }
      const [vendor] = await tx.select().from(vendors).where(eq(vendors.id, order.vendorId));
      if (!vendor) throw notFound('That vendor');
      const location = await resolveLocation(tx, input.locationId);
      const lines = await loadLines(tx, orderId);
      const checked = await validateReceipt(tx, input, lines);

      const number = await nextNumber(tx, 'goods_receipts', 'GRN', input.receivedOn);
      const amount = checked.reduce(
        (sum, row) => sum + lineTotal({ ...row.line, quantity: row.quantity }),
        0,
      );
      const payableId = await raiseBill(tx, { number, order, vendor, input, amount });
      const [receipt] = await tx
        .insert(goodsReceipts)
        .values({
          number,
          purchaseOrderId: orderId,
          locationId: location.id,
          receivedOn: input.receivedOn,
          vendorInvoiceNumber: input.vendorInvoiceNumber,
          vendorInvoiceDate: input.vendorInvoiceDate,
          notes: input.notes,
          amountPaise: amount,
          payableId,
          receivedByUserId: actor.userId,
        })
        .returning({ id: goodsReceipts.id });
      if (!receipt) throw new Error('Goods receipt insert returned nothing.');

      for (const row of checked) {
        await receiveLine(tx, actor, {
          row,
          receiptId: receipt.id,
          locationId: location.id,
          order,
        });
      }
      const after = await loadLines(tx, orderId);
      const stage = receiptStage(
        after.map((line) => ({ ordered: line.quantity, received: line.receivedQuantity })),
      );
      await tx
        .update(purchaseOrders)
        .set({ status: stage, updatedAt: new Date() })
        .where(eq(purchaseOrders.id, orderId));
      if (order.projectId) {
        await tx.insert(projectActivities).values({
          projectId: order.projectId,
          kind: 'material',
          message: `Material received on ${order.number} (${number}).`,
          userId: actor.userId,
        });
      }
      await recordAudit(tx, actor.userId, 'goods_receipt.created', 'purchase_order', orderId, {
        number,
        amount,
      });
      await reportRejections(tx, actor, { number, order, vendor: vendor.name, checked });
    });
    return purchaseOrderDetail(this.db, orderId);
  }
}

async function receiveLine(
  tx: Transaction,
  actor: Actor,
  context: {
    readonly row: CheckedLine;
    readonly receiptId: string;
    readonly locationId: string;
    readonly order: typeof purchaseOrders.$inferSelect;
  },
): Promise<void> {
  const { row, receiptId, locationId, order } = context;
  const [receiptLine] = await tx
    .insert(goodsReceiptLines)
    .values({
      receiptId,
      purchaseOrderLineId: row.line.id,
      productId: row.line.productId,
      quantity: row.quantity,
      cellManufacturer: row.cellManufacturer,
      cellInvoiceNumber: row.cellInvoiceNumber,
      rejectedQuantity: row.rejectedQuantity,
      rejectionReason: row.rejectionReason,
    })
    .returning({ id: goodsReceiptLines.id });
  if (row.quantity <= 0) return;
  await tx
    .update(purchaseOrderLines)
    .set({ receivedQuantity: row.line.receivedQuantity + row.quantity })
    .where(eq(purchaseOrderLines.id, row.line.id));
  const productId = row.line.productId;
  if (!productId) return;
  await moveStock(tx, {
    productId,
    label: row.line.description,
    locationId,
    kind: 'receipt',
    onHand: row.quantity,
    reserved: 0,
    projectId: order.projectId,
    referenceId: receiptId,
    note: order.number,
    userId: actor.userId,
  });
  if (row.serials.length > 0 && receiptLine) {
    await tx.insert(stockSerials).values(
      row.serials.map((serial) => ({
        productId,
        serial,
        locationId,
        receiptLineId: receiptLine.id,
      })),
    );
  }
}

/** Procurement hears when units fail inspection: the vendor owes replacements. */
async function reportRejections(
  tx: Transaction,
  actor: Actor,
  context: {
    readonly number: string;
    readonly order: typeof purchaseOrders.$inferSelect;
    readonly vendor: string;
    readonly checked: readonly CheckedLine[];
  },
): Promise<void> {
  const rejected = context.checked.filter((row) => row.rejectedQuantity > 0);
  if (rejected.length === 0) return;
  const what = rejected
    .map((row) => `${row.rejectedQuantity} ${row.line.description} (${row.rejectionReason})`)
    .join('; ');
  await notifyHolders(
    tx,
    'procurement.manage',
    {
      kind: 'inspection_failed',
      title: `Failed inspection on ${context.number}`,
      body: `${context.vendor}, ${context.order.number}: ${what}. Still due from the vendor.`,
      ...(context.order.projectId
        ? {
            subject: {
              type: 'project' as const,
              id: context.order.projectId,
              projectId: context.order.projectId,
            },
          }
        : {}),
      dedupeKey: `inspection_failed:${context.number}`,
    },
    actor.userId,
  );
}

/** The vendor's bill for what was accepted, due after their terms; none if nothing was. */
async function raiseBill(
  tx: Transaction,
  context: {
    readonly number: string;
    readonly order: typeof purchaseOrders.$inferSelect;
    readonly vendor: typeof vendors.$inferSelect;
    readonly input: ReceiptData;
    readonly amount: number;
  },
): Promise<string | null> {
  const { number, order, vendor, input, amount } = context;
  if (amount <= 0) return null;
  const invoice = input.vendorInvoiceNumber ? ` · invoice ${input.vendorInvoiceNumber}` : '';
  const [payable] = await tx
    .insert(payables)
    .values({
      projectId: order.projectId,
      party: 'vendor',
      partyName: vendor.name,
      description: `${number} against ${order.number}${invoice}`,
      billNumber: input.vendorInvoiceNumber ?? null,
      amountPaise: amount,
      dueOn: addDays(input.receivedOn, vendor.paymentTermsDays),
    })
    .returning({ id: payables.id });
  return payable?.id ?? null;
}
