import type { PurchaseRequest } from '@oneohm/api-contracts';
import {
  products,
  projects,
  purchaseOrders,
  purchaseRequestLines,
  purchaseRequests,
  stockLevels,
  users,
} from '@oneohm/database';
import { available, earliestNeed } from '@oneohm/domain';
import { asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { notFound } from '../../common/http/errors';
import type { Database } from '../../config/core.module';

const requesters = alias(users, 'requesters');
const deciders = alias(users, 'deciders');

type Reader = Pick<Database, 'select'>;

/** Requests with their lines, newest first, each line with free stock right now. */
export async function purchaseRequestRows(db: Reader, where?: SQL): Promise<PurchaseRequest[]> {
  const rows = await db
    .select({
      request: purchaseRequests,
      project: { id: projects.id, code: projects.code, name: projects.name },
      requester: requesters.fullName,
      decider: deciders.fullName,
      order: {
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        status: purchaseOrders.status,
      },
    })
    .from(purchaseRequests)
    .innerJoin(requesters, eq(requesters.id, purchaseRequests.requestedByUserId))
    .leftJoin(deciders, eq(deciders.id, purchaseRequests.decidedByUserId))
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, purchaseRequests.purchaseOrderId))
    .where(where)
    .orderBy(desc(purchaseRequests.createdAt))
    .limit(300);
  if (rows.length === 0) return [];
  const lines = await db
    .select({ line: purchaseRequestLines, product: products })
    .from(purchaseRequestLines)
    .innerJoin(products, eq(products.id, purchaseRequestLines.productId))
    .where(
      inArray(
        purchaseRequestLines.requestId,
        rows.map((row) => row.request.id),
      ),
    )
    .orderBy(asc(purchaseRequestLines.position));
  const free = await freeStock(db, [...new Set(lines.map((row) => row.line.productId))]);
  return rows.map((row) => {
    const own = lines
      .filter((entry) => entry.line.requestId === row.request.id)
      .map(({ line, product }) => ({
        id: line.id,
        productId: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        unit: product.unit,
        quantity: line.quantity,
        neededBy: line.neededBy,
        costPaise: product.costPaise,
        taxRateBp: product.taxRateBp,
        freeInStore: free.get(product.id) ?? 0,
      }));
    const { request } = row;
    return {
      id: request.id,
      number: request.number,
      status: request.status,
      project: row.project?.id ? row.project : null,
      reason: request.reason,
      requestedBy: { id: request.requestedByUserId, fullName: row.requester },
      requestedAt: request.createdAt.toISOString(),
      neededBy: earliestNeed(own),
      decidedBy:
        request.decidedByUserId && row.decider
          ? { id: request.decidedByUserId, fullName: row.decider }
          : null,
      decidedAt: request.decidedAt?.toISOString() ?? null,
      decisionNote: request.decisionNote,
      purchaseOrder: row.order?.id ? row.order : null,
      lines: own,
    };
  });
}

export async function purchaseRequestRow(db: Reader, id: string): Promise<PurchaseRequest> {
  const [row] = await purchaseRequestRows(db, eq(purchaseRequests.id, id));
  if (!row) throw notFound('That purchase request');
  return row;
}

/** Free stock per product across every location. */
export async function freeStock(
  db: Reader,
  productIds: readonly string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const totals = await db
    .select({
      productId: stockLevels.productId,
      onHand: sql<number>`coalesce(sum(${stockLevels.onHand}), 0)::float8`,
      reserved: sql<number>`coalesce(sum(${stockLevels.reserved}), 0)::float8`,
    })
    .from(stockLevels)
    .where(inArray(stockLevels.productId, [...productIds]))
    .groupBy(stockLevels.productId);
  return new Map(
    totals.map((row) => [
      row.productId,
      available({ onHand: Number(row.onHand), reserved: Number(row.reserved) }),
    ]),
  );
}
