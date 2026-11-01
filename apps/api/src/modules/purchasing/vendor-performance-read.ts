import {
  goodsReceiptLines,
  goodsReceipts,
  payables,
  purchaseOrderLines,
  purchaseOrders,
  vendorAdvances,
} from '@oneohm/database';
import { and, desc, eq, gt, ne, sql } from 'drizzle-orm';
import type { Database } from '../../config/core.module';

type Reader = Pick<Database, 'select'>;

/** Everything the scorecards are worked out from, for one vendor or all of them. */
export async function loadVendorFacts(db: Reader, vendorId?: string) {
  const byVendor = vendorId ? eq(purchaseOrders.vendorId, vendorId) : undefined;
  const orders = await db
    .select({
      id: purchaseOrders.id,
      number: purchaseOrders.number,
      vendorId: purchaseOrders.vendorId,
      projectId: purchaseOrders.projectId,
      status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate,
      expectedOn: purchaseOrders.expectedOn,
      totalPaise: purchaseOrders.totalPaise,
    })
    .from(purchaseOrders)
    .where(byVendor)
    .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.number));
  const receipts = await db
    .select({
      id: goodsReceipts.id,
      number: goodsReceipts.number,
      orderId: goodsReceipts.purchaseOrderId,
      vendorId: purchaseOrders.vendorId,
      receivedOn: goodsReceipts.receivedOn,
    })
    .from(goodsReceipts)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
    .where(byVendor);
  const rejections = await db
    .select({
      receiptId: goodsReceiptLines.receiptId,
      vendorId: purchaseOrders.vendorId,
      receiptNumber: goodsReceipts.number,
      receivedOn: goodsReceipts.receivedOn,
      description: purchaseOrderLines.description,
      unit: purchaseOrderLines.unit,
      rejectedQuantity: goodsReceiptLines.rejectedQuantity,
      reason: goodsReceiptLines.rejectionReason,
    })
    .from(goodsReceiptLines)
    .innerJoin(goodsReceipts, eq(goodsReceipts.id, goodsReceiptLines.receiptId))
    .innerJoin(purchaseOrderLines, eq(purchaseOrderLines.id, goodsReceiptLines.purchaseOrderLineId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
    .where(and(gt(goodsReceiptLines.rejectedQuantity, 0), byVendor))
    .orderBy(desc(goodsReceipts.receivedOn));
  const bills = await db
    .select({
      payable: payables,
      vendorId: purchaseOrders.vendorId,
      billedOn: sql<string>`coalesce(${goodsReceipts.vendorInvoiceDate}, ${goodsReceipts.receivedOn})::text`,
    })
    .from(payables)
    .innerJoin(goodsReceipts, eq(goodsReceipts.payableId, payables.id))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
    .where(and(ne(payables.status, 'paid'), byVendor))
    .orderBy(payables.dueOn);
  const advances = await db
    .select({
      vendorId: vendorAdvances.vendorId,
      open: sql<string>`coalesce(sum(${vendorAdvances.amountPaise} - ${vendorAdvances.adjustedPaise}), 0)`,
    })
    .from(vendorAdvances)
    .where(
      and(
        eq(vendorAdvances.status, 'paid'),
        vendorId ? eq(vendorAdvances.vendorId, vendorId) : undefined,
      ),
    )
    .groupBy(vendorAdvances.vendorId);
  return { orders, receipts, rejections, bills, advances };
}

export type VendorFacts = Awaited<ReturnType<typeof loadVendorFacts>>;

/** The day each order's goods arrived, by order. */
export function receiptDates(facts: VendorFacts): Map<string, string[]> {
  const dates = new Map<string, string[]>();
  for (const receipt of facts.receipts) {
    dates.set(receipt.orderId, [...(dates.get(receipt.orderId) ?? []), receipt.receivedOn]);
  }
  return dates;
}
