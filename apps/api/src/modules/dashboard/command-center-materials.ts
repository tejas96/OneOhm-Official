import type { MaterialRisks } from '@oneohm/api-contracts';
import {
  type Database,
  products,
  projects,
  projectTasks,
  purchaseOrderLines,
  purchaseOrders,
  quotations,
  stockLevels,
  stockReservations,
  stockThresholds,
  vendors,
} from '@oneohm/database';
import { available, materialShortfall } from '@oneohm/domain';
import { addDays, daysBetween } from '@oneohm/shared';
import { and, asc, eq, inArray, lt, lte, ne, sql } from 'drizzle-orm';
import { invertersByQuotation } from '../quotations/quotation-inverters';
import type { CenterScope } from './command-center-scope';

/** Rows each list shows; the counts say how many there are in all. */
const MAX_ROWS = 6;

/** Material shortages and procurement risks for the command centre (PRD 3.1). */
export async function materialRisks(db: Database, scope: CenterScope): Promise<MaterialRisks> {
  const [belowReorder, latePurchaseOrders, shortProjects] = await Promise.all([
    itemsBelowReorder(db),
    lateOrders(db, scope.today),
    projectsShort(db, scope),
  ]);
  return {
    belowReorder: belowReorder.slice(0, MAX_ROWS),
    latePurchaseOrders: latePurchaseOrders.slice(0, MAX_ROWS),
    shortProjects: shortProjects.slice(0, MAX_ROWS),
    counts: {
      belowReorder: belowReorder.length,
      latePurchaseOrders: latePurchaseOrders.length,
      shortProjects: shortProjects.length,
    },
  };
}

/** Free stock across every store below the item's reorder level, emptiest first. */
async function itemsBelowReorder(db: Database) {
  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      unit: products.unit,
      minimum: stockThresholds.minimum,
      onHand: sql<number>`coalesce(sum(${stockLevels.onHand}), 0)::float8`,
      reserved: sql<number>`coalesce(sum(${stockLevels.reserved}), 0)::float8`,
    })
    .from(stockThresholds)
    .innerJoin(products, eq(products.id, stockThresholds.productId))
    .leftJoin(stockLevels, eq(stockLevels.productId, stockThresholds.productId))
    .groupBy(products.id, stockThresholds.minimum);
  return rows
    .map((row) => ({
      productId: row.productId,
      name: row.name,
      unit: row.unit,
      minimum: row.minimum,
      free: available({ onHand: row.onHand, reserved: row.reserved }),
    }))
    .filter((row) => row.free < row.minimum)
    .sort((a, b) => a.free / (a.minimum || 1) - b.free / (b.minimum || 1));
}

/** Orders sent to vendors and past their expected date with goods still to come. */
async function lateOrders(db: Database, today: string) {
  const rows = await db
    .select({
      id: purchaseOrders.id,
      number: purchaseOrders.number,
      vendorName: vendors.name,
      expectedOn: purchaseOrders.expectedOn,
      projectCode: projects.code,
    })
    .from(purchaseOrders)
    .innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .where(
      and(
        inArray(purchaseOrders.status, ['sent', 'partly_received']),
        lt(purchaseOrders.expectedOn, today),
      ),
    )
    .orderBy(asc(purchaseOrders.expectedOn));
  return rows.flatMap((row) =>
    row.expectedOn
      ? [{ ...row, expectedOn: row.expectedOn, daysLate: daysBetween(row.expectedOn, today) }]
      : [],
  );
}

/**
 * Live projects whose material or installation work falls due within two weeks (or is
 * late) while the quotation needs more than is held for them or on order.
 */
async function projectsShort(db: Database, scope: CenterScope) {
  const live = await db
    .selectDistinct({
      project: { id: projects.id, code: projects.code, name: projects.name },
      quotation: {
        id: quotations.id,
        moduleCount: quotations.moduleCount,
        panelProductId: quotations.panelProductId,
        batteryProductId: quotations.batteryProductId,
      },
    })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .innerJoin(projectTasks, eq(projectTasks.projectId, projects.id))
    .where(
      and(
        scope.projects,
        ne(projectTasks.status, 'completed'),
        inArray(projectTasks.stage, ['material', 'installation']),
        lte(projectTasks.dueDate, addDays(scope.today, scope.settings.materialLookAheadDays)),
      ),
    );
  if (live.length === 0) return [];
  const ids = live.map((row) => row.project.id);
  const inverters = await invertersByQuotation(
    db,
    live.map((row) => row.quotation.id),
  );
  const [held, ordered, catalog] = await Promise.all([
    db
      .select({
        projectId: stockReservations.projectId,
        productId: stockReservations.productId,
        quantity: stockReservations.quantity,
      })
      .from(stockReservations)
      .where(
        and(
          inArray(stockReservations.projectId, ids),
          inArray(stockReservations.status, ['active', 'dispatched', 'issued']),
        ),
      ),
    db
      .select({
        projectId: purchaseOrders.projectId,
        productId: purchaseOrderLines.productId,
        toCome: sql<number>`greatest(${purchaseOrderLines.quantity} - ${purchaseOrderLines.receivedQuantity}, 0)::float8`,
      })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId))
      .where(
        and(
          inArray(purchaseOrders.projectId, ids),
          inArray(purchaseOrders.status, ['sent', 'partly_received']),
        ),
      ),
    db.select({ id: products.id, name: products.name, unit: products.unit }).from(products),
  ]);
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  return live
    .map(({ project, quotation }) => {
      const needs = [
        { productId: quotation.panelProductId, needed: quotation.moduleCount },
        ...(inverters.get(quotation.id) ?? []).map((pick) => ({
          productId: pick.productId,
          needed: pick.quantity,
        })),
        ...(quotation.batteryProductId
          ? [{ productId: quotation.batteryProductId, needed: 1 }]
          : []),
      ];
      const short = materialShortfall(
        needs.map((need) => ({
          ...need,
          held: sum(
            held
              .filter((row) => row.projectId === project.id && row.productId === need.productId)
              .map((row) => row.quantity),
          ),
          onOrder: sum(
            ordered
              .filter((row) => row.projectId === project.id && row.productId === need.productId)
              .map((row) => row.toCome),
          ),
        })),
      );
      return {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        items: short.map((row) => {
          const product = catalog.find((item) => item.id === row.productId);
          return { name: product?.name ?? 'Item', unit: product?.unit ?? '', short: row.short };
        }),
      };
    })
    .filter((row) => row.items.length > 0)
    .sort((a, b) => a.projectCode.localeCompare(b.projectCode));
}
