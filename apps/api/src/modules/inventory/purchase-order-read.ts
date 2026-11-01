import type {
  PurchaseOrderDetail,
  PurchaseOrderLine,
  PurchaseOrderSummary,
} from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  goodsReceiptLines,
  goodsReceipts,
  products,
  projects,
  purchaseOrderLines,
  purchaseOrders,
  stockLocations,
  stockSerials,
  users,
  vendors,
} from '@oneohm/database';
import { isSerialised, purchaseLineTotal } from '@oneohm/domain';
import { asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';

type LineRow = typeof purchaseOrderLines.$inferSelect;

/** A line's amount with GST, rounded to the paisa. Kept for receiving; the rule lives in @oneohm/domain. */
export const lineTotal = purchaseLineTotal;

export async function purchaseOrderSummaries(
  db: DatabaseExecutor,
  where?: SQL,
): Promise<PurchaseOrderSummary[]> {
  const rows = await db
    .select({
      order: purchaseOrders,
      vendorName: vendors.name,
      projectCode: projects.code,
    })
    .from(purchaseOrders)
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .where(where)
    .orderBy(desc(purchaseOrders.createdAt));
  if (rows.length === 0) return [];
  const lines = await db
    .select()
    .from(purchaseOrderLines)
    .where(
      inArray(
        purchaseOrderLines.purchaseOrderId,
        rows.map((row) => row.order.id),
      ),
    );
  return rows.map(({ order, vendorName, projectCode }) => {
    const own = lines.filter((line) => line.purchaseOrderId === order.id);
    const ordered = own.reduce((sum, line) => sum + line.quantity, 0);
    const received = own.reduce((sum, line) => sum + line.receivedQuantity, 0);
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      vendorId: order.vendorId,
      vendorName,
      projectId: order.projectId,
      projectCode,
      orderDate: order.orderDate,
      expectedOn: order.expectedOn,
      totalPaise: order.totalPaise,
      lineCount: own.length,
      receivedShare: ordered > 0 ? Math.min(1, received / ordered) : 0,
    };
  });
}

export async function purchaseOrderDetail(
  db: DatabaseExecutor,
  id: string,
): Promise<PurchaseOrderDetail> {
  const [summary] = await purchaseOrderSummaries(db, eq(purchaseOrders.id, id));
  if (!summary) throw notFound('That purchase order');
  const [extra] = await db
    .select({
      order: purchaseOrders,
      gstin: vendors.gstin,
      projectName: projects.name,
      createdBy: users.fullName,
    })
    .from(purchaseOrders)
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .leftJoin(users, eq(users.id, purchaseOrders.createdByUserId))
    .where(eq(purchaseOrders.id, id));
  if (!extra) throw notFound('That purchase order');
  const lineRows = await db
    .select({ line: purchaseOrderLines, category: products.category })
    .from(purchaseOrderLines)
    .leftJoin(products, eq(products.id, purchaseOrderLines.productId))
    .where(eq(purchaseOrderLines.purchaseOrderId, id))
    .orderBy(asc(purchaseOrderLines.position));
  return {
    ...summary,
    vendorGstin: extra.gstin,
    projectName: extra.projectName,
    notes: extra.order.notes,
    subtotalPaise: extra.order.subtotalPaise,
    taxPaise: extra.order.taxPaise,
    createdBy: extra.createdBy,
    lines: lineRows.map(({ line, category }) => presentLine(line, category)),
    receipts: await receiptsOf(
      db,
      id,
      lineRows.map(({ line }) => line),
    ),
  };
}

function presentLine(line: LineRow, category: PurchaseOrderLine['category']): PurchaseOrderLine {
  return {
    id: line.id,
    productId: line.productId,
    category,
    serialised: category ? isSerialised(category) : false,
    description: line.description,
    unit: line.unit,
    quantity: line.quantity,
    receivedQuantity: line.receivedQuantity,
    ratePaise: line.ratePaise,
    taxRateBp: line.taxRateBp,
    totalPaise: purchaseLineTotal(line),
  };
}

async function receiptsOf(db: DatabaseExecutor, orderId: string, lines: readonly LineRow[]) {
  const receipts = await db
    .select({ receipt: goodsReceipts, locationName: stockLocations.name, by: users.fullName })
    .from(goodsReceipts)
    .innerJoin(stockLocations, eq(stockLocations.id, goodsReceipts.locationId))
    .leftJoin(users, eq(users.id, goodsReceipts.receivedByUserId))
    .where(eq(goodsReceipts.purchaseOrderId, orderId))
    .orderBy(desc(goodsReceipts.createdAt));
  if (receipts.length === 0) return [];
  const receiptLines = await db
    .select()
    .from(goodsReceiptLines)
    .where(
      inArray(
        goodsReceiptLines.receiptId,
        receipts.map((row) => row.receipt.id),
      ),
    );
  const serials = receiptLines.length
    ? await db
        .select({ lineId: stockSerials.receiptLineId, serial: stockSerials.serial })
        .from(stockSerials)
        .where(
          inArray(
            stockSerials.receiptLineId,
            receiptLines.map((line) => line.id),
          ),
        )
    : [];
  return receipts.map(({ receipt, locationName, by }) => ({
    id: receipt.id,
    number: receipt.number,
    receivedOn: receipt.receivedOn,
    locationName,
    vendorInvoiceNumber: receipt.vendorInvoiceNumber,
    amountPaise: receipt.amountPaise,
    by,
    lines: receiptLines
      .filter((line) => line.receiptId === receipt.id)
      .map((line) => ({
        description:
          lines.find((orderLine) => orderLine.id === line.purchaseOrderLineId)?.description ?? '',
        quantity: line.quantity,
        serials: serials.filter((row) => row.lineId === line.id).map((row) => row.serial),
        rejectedQuantity: line.rejectedQuantity,
        rejectionReason: line.rejectionReason,
      })),
  }));
}
