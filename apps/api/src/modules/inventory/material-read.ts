import type { Dispatch, MaterialRequirement, ProjectMaterial } from '@oneohm/api-contracts';
import {
  contractors,
  type DatabaseExecutor,
  dispatches,
  goodsReceiptLines,
  products,
  projects,
  purchaseOrderLines,
  purchaseOrders,
  quotationLines,
  quotations,
  stockLevels,
  stockLocations,
  stockReservations,
  stockSerials,
  users,
} from '@oneohm/database';
import { roundQuantity } from '@oneohm/domain';
import { and, asc, desc, eq, inArray, isNotNull, notInArray, type SQL } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { invertersOf } from '../quotations/quotation-inverters';
import { pricedLinesOnly } from '../quotations/quotation-rows';
import { purchaseOrderSummaries } from './purchase-order-read';
import { quotationNeeds } from './quotation-needs';

type ProductRow = typeof products.$inferSelect;

/**
 * What the accepted quotation needs from the store (PRD 3.10, C26): panels, inverter and
 * battery, plus every other priced line that names its product: cable, structure parts,
 * electrical kits and gifts. Lines naming the same product add up.
 */
export async function projectNeeds(db: DatabaseExecutor, projectId: string) {
  const [row] = await db
    .select({ project: projects, quotation: quotations })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(eq(projects.id, projectId));
  if (!row) throw notFound('That project');
  const { project, quotation } = row;
  const stocked = await db
    .select({
      key: quotationLines.key,
      productId: quotationLines.productId,
      quantity: quotationLines.quantity,
    })
    .from(quotationLines)
    .where(
      and(
        eq(quotationLines.quotationId, quotation.id),
        isNotNull(quotationLines.productId),
        pricedLinesOnly(),
      ),
    );
  const inverters = await invertersOf(db, quotation.id);
  const needs = quotationNeeds({ ...quotation, inverters }, stocked);
  const catalog = await db
    .select()
    .from(products)
    .where(
      inArray(
        products.id,
        needs.map((need) => need.productId),
      ),
    );
  return { project, needs, catalog };
}

export async function dispatchList(db: DatabaseExecutor, where?: SQL): Promise<Dispatch[]> {
  const rows = await db
    .select({
      dispatch: dispatches,
      projectCode: projects.code,
      projectName: projects.name,
      locationName: stockLocations.name,
      contractorName: contractors.name,
      by: users.fullName,
    })
    .from(dispatches)
    .innerJoin(projects, eq(projects.id, dispatches.projectId))
    .innerJoin(stockLocations, eq(stockLocations.id, dispatches.locationId))
    .leftJoin(contractors, eq(contractors.id, dispatches.contractorId))
    .leftJoin(users, eq(users.id, dispatches.createdByUserId))
    .where(where)
    .orderBy(desc(dispatches.createdAt));
  return rows.map(({ dispatch, contractorName, ...row }) => ({
    id: dispatch.id,
    number: dispatch.number,
    projectId: dispatch.projectId,
    dispatchedOn: dispatch.dispatchedOn,
    vehicle: dispatch.vehicle,
    driverName: dispatch.driverName,
    driverPhone: dispatch.driverPhone,
    notes: dispatch.notes,
    contractor:
      dispatch.contractorId && contractorName
        ? { id: dispatch.contractorId, name: contractorName }
        : null,
    lines: dispatch.lines as Dispatch['lines'],
    ...row,
  }));
}

export async function projectMaterial(
  db: DatabaseExecutor,
  projectId: string,
): Promise<ProjectMaterial> {
  const { project, needs, catalog } = await projectNeeds(db, projectId);
  const ids = needs.map((need) => need.productId);
  const orders = await purchaseOrderSummaries(db, eq(purchaseOrders.projectId, projectId));
  const orderedLines = await db
    .select({ productId: purchaseOrderLines.productId, quantity: purchaseOrderLines.quantity })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
    .where(
      and(
        eq(purchaseOrders.projectId, projectId),
        notInArray(purchaseOrders.status, ['draft', 'cancelled']),
      ),
    );
  const reservations = await db
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.projectId, projectId));
  const levels = await db.select().from(stockLevels).where(inArray(stockLevels.productId, ids));
  const serials = await db
    .select({
      productId: stockSerials.productId,
      productName: products.name,
      serial: stockSerials.serial,
      status: stockSerials.status,
      cellManufacturer: goodsReceiptLines.cellManufacturer,
      cellInvoiceNumber: goodsReceiptLines.cellInvoiceNumber,
    })
    .from(stockSerials)
    .innerJoin(products, eq(products.id, stockSerials.productId))
    .leftJoin(goodsReceiptLines, eq(goodsReceiptLines.id, stockSerials.receiptLineId))
    .where(eq(stockSerials.projectId, projectId))
    .orderBy(asc(products.name), asc(stockSerials.serial));

  const sum = (rows: readonly { quantity: number }[]) =>
    roundQuantity(rows.reduce((total, row) => total + row.quantity, 0));
  const requirements: MaterialRequirement[] = needs.flatMap((need) => {
    const product = catalog.find((row) => row.id === need.productId);
    if (!product) return [];
    const mine = reservations.filter((row) => row.productId === need.productId);
    return [
      {
        productId: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        unit: product.unit,
        ratePaise: product.costPaise,
        taxRateBp: product.taxRateBp,
        needed: need.quantity,
        ordered: sum(orderedLines.filter((row) => row.productId === need.productId)),
        reserved: sum(mine.filter((row) => row.status === 'active')),
        dispatched: sum(mine.filter((row) => row.status === 'dispatched')),
        issued: sum(mine.filter((row) => row.status === 'issued')),
        freeInStore: roundQuantity(
          levels
            .filter((row) => row.productId === need.productId)
            .reduce((total, row) => total + Math.max(0, row.onHand - row.reserved), 0),
        ),
      },
    ];
  });

  const sent = orders.filter((order) => order.status !== 'draft' && order.status !== 'cancelled');
  const covered = (row: MaterialRequirement, count: number) => count >= row.needed - 0.0005;
  const sentOut = (row: MaterialRequirement) => row.dispatched + row.issued;
  const stage = requirements.every((row) => covered(row, sentOut(row)))
    ? 'dispatched'
    : requirements.every((row) => covered(row, row.reserved + sentOut(row)))
      ? 'reserved'
      : sent.length > 0
        ? 'ordered'
        : 'to_order';

  return {
    projectId,
    projectCode: project.code,
    projectName: project.name,
    stage,
    requirements,
    purchaseOrders: orders,
    serials: serials.map(({ productName, serial, status }) => ({ productName, serial, status })),
    dispatches: await dispatchList(db, eq(dispatches.projectId, projectId)),
    facts: materialFacts({ catalog, serials, latestOrder: sent[0] }),
  };
}

/** Report facts the store and purchasing know, keyed like the task captures. */
function materialFacts(input: {
  readonly catalog: readonly ProductRow[];
  readonly serials: readonly {
    productId: string;
    serial: string;
    cellManufacturer: string | null;
    cellInvoiceNumber: string | null;
  }[];
  readonly latestOrder: { number: string; orderDate: string } | undefined;
}): Record<string, string> {
  const facts: Record<string, string> = {};
  if (input.latestOrder) {
    facts.purchase_order_number = input.latestOrder.number;
    facts.purchase_order_date = input.latestOrder.orderDate;
  }
  const panel = input.catalog.find((row) => row.category === 'panel');
  // A quotation may carry several inverter models: their makes and serials all count.
  const inverters = input.catalog.filter((row) => row.category === 'inverter');
  const panelSerials = input.serials.filter((row) => row.productId === panel?.id);
  const inverterSerials = input.serials.filter((row) =>
    inverters.some((inverter) => inverter.id === row.productId),
  );
  if (panel && panelSerials.length > 0) {
    facts.module_make = panel.brand;
    if (panel.wattageWp) facts.module_wattage = String(panel.wattageWp);
    facts.module_serial_numbers = panelSerials.map((row) => row.serial).join(', ');
    facts.module_count = String(panelSerials.length);
    const cells = panelSerials.find((row) => row.cellManufacturer || row.cellInvoiceNumber);
    if (cells?.cellManufacturer) facts.cell_manufacturer_name = cells.cellManufacturer;
    if (cells?.cellInvoiceNumber) facts.cell_gst_invoice_no = cells.cellInvoiceNumber;
  }
  if (inverterSerials[0]) {
    facts.inverter_make = [
      ...new Set(
        inverters
          .filter((inverter) => inverterSerials.some((row) => row.productId === inverter.id))
          .map((inverter) => inverter.brand),
      ),
    ].join(', ');
    facts.inverter_serial_number = inverterSerials.map((row) => row.serial).join(', ');
  }
  return facts;
}
