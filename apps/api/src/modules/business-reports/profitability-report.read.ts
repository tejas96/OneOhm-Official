import {
  customers,
  type DatabaseExecutor,
  goodsReceipts,
  payables,
  products,
  projects,
  quotationLines,
  quotations,
  stockMovements,
  travelClaims,
} from '@oneohm/database';
import type { LineCategory } from '@oneohm/domain';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { pricedLinesOnly } from '../quotations/quotation-rows';
import {
  acceptedQuotationId,
  type BillFact,
  MATERIAL_MOVES,
  type StockMoveFact,
  type TravelFact,
} from './profitability-report.math';
import type { ReportScope } from './report-scope';

export interface ProjectFact {
  readonly id: string;
  readonly code: string;
  readonly customerName: string;
  readonly startDate: string;
  readonly status: 'active' | 'operational' | 'completed' | 'cancelled';
  /** The accepted quotation the margin is measured against. */
  readonly quotation: {
    readonly id: string;
    readonly totalPaise: number;
    readonly taxPaise: number;
    readonly costPaise: number;
  } | null;
}

/** Live projects for the filters that started in the range, with their accepted quotation. */
export async function readProjects(
  db: DatabaseExecutor,
  scope: ReportScope,
): Promise<ProjectFact[]> {
  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      customerName: customers.name,
      startDate: projects.startDate,
      status: projects.status,
      quotationId: projects.quotationId,
      revisionQuotationId: projects.revisionQuotationId,
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(
      and(
        scope.projects,
        gte(projects.startDate, scope.meta.range.start),
        lte(projects.startDate, scope.meta.range.end),
      ),
    );
  if (rows.length === 0) return [];
  const ids = rows.flatMap((row) =>
    row.revisionQuotationId ? [row.quotationId, row.revisionQuotationId] : [row.quotationId],
  );
  const quotes = await db
    .select({
      id: quotations.id,
      status: quotations.status,
      totalPaise: quotations.totalPaise,
      taxPaise: quotations.taxPaise,
      costPaise: quotations.costPaise,
    })
    .from(quotations)
    .where(inArray(quotations.id, ids));
  const byId = new Map(quotes.map((quote) => [quote.id, quote]));
  const statusOf = new Map(quotes.map((quote) => [quote.id, quote.status as string]));
  return rows.map(({ quotationId, revisionQuotationId, ...row }) => ({
    ...row,
    quotation:
      byId.get(acceptedQuotationId({ quotationId, revisionQuotationId }, statusOf)) ?? null,
  }));
}

/** The quoted cost of every line, by category, for these quotations. */
export async function readQuotedLines(
  db: DatabaseExecutor,
  quotationIds: readonly string[],
): Promise<{ quotationId: string; category: LineCategory; costPaise: number }[]> {
  if (quotationIds.length === 0) return [];
  return db
    .select({
      quotationId: quotationLines.quotationId,
      category: quotationLines.category,
      costPaise: quotationLines.costPaise,
    })
    .from(quotationLines)
    .where(and(inArray(quotationLines.quotationId, [...quotationIds]), pricedLinesOnly()));
}

/** Vendor and contractor bills on these projects, marked when a goods receipt raised them. */
export async function readBills(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<(BillFact & { projectId: string })[]> {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({
      projectId: payables.projectId,
      party: payables.party,
      status: payables.status,
      amountPaise: payables.amountPaise,
      receipt: goodsReceipts.id,
    })
    .from(payables)
    .leftJoin(goodsReceipts, eq(goodsReceipts.payableId, payables.id))
    .where(
      and(
        inArray(payables.projectId, [...projectIds]),
        inArray(payables.party, ['vendor', 'contractor']),
      ),
    );
  return rows.flatMap((row) =>
    row.projectId && (row.party === 'vendor' || row.party === 'contractor')
      ? [
          {
            projectId: row.projectId,
            party: row.party,
            status: row.status,
            amountPaise: row.amountPaise,
            fromReceipt: row.receipt !== null,
          },
        ]
      : [],
  );
}

/**
 * Stock dispatched to these projects or issued straight to their contractors, and what
 * the contractors returned unused, with each product's cost.
 */
export async function readStockMoves(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<(StockMoveFact & { projectId: string })[]> {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({
      projectId: stockMovements.projectId,
      onHandDelta: stockMovements.onHandDelta,
      unitCostPaise: products.costPaise,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(
      and(
        inArray(stockMovements.kind, [...MATERIAL_MOVES]),
        inArray(stockMovements.projectId, [...projectIds]),
      ),
    );
  return rows.flatMap((row) => (row.projectId ? [{ ...row, projectId: row.projectId }] : []));
}

/** Employees' travel claims tagged to these projects. */
export async function readTravel(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<(TravelFact & { projectId: string })[]> {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({
      projectId: travelClaims.projectId,
      status: travelClaims.status,
      amountPaise: travelClaims.amountPaise,
    })
    .from(travelClaims)
    .where(inArray(travelClaims.projectId, [...projectIds]));
  return rows.flatMap((row) => (row.projectId ? [{ ...row, projectId: row.projectId }] : []));
}
