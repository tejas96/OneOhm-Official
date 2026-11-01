import type { ContractorMaterial, ProjectCustody, ReconciliationRow } from '@oneohm/api-contracts';
import {
  contractors,
  type DatabaseExecutor,
  materialSlips,
  type products,
  projects,
  quotationLines,
  quotations,
  stockReservations,
  workOrders,
} from '@oneohm/database';
import { custodyTotals, isMaterialCategory, reconcileLine, roundQuantity } from '@oneohm/domain';
import { and, asc, eq, ne } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { pricedLinesOnly } from '../quotations/quotation-rows';
import {
  type CustodyEntryRow,
  custodyEntries,
  custodyProjects,
  installedProjects,
  slipList,
} from './custody-read';

type QuoteLine = typeof quotationLines.$inferSelect;

/** The accepted quotation's goods lines, and the stock items it names for some of them. */
export async function quoteMaterial(db: DatabaseExecutor, projectId: string) {
  const [row] = await db
    .select({ project: projects, quotation: quotations })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(eq(projects.id, projectId));
  if (!row) throw notFound('That project');
  const lines = await db
    .select()
    .from(quotationLines)
    .where(and(eq(quotationLines.quotationId, row.quotation.id), pricedLinesOnly()))
    .orderBy(asc(quotationLines.position));
  const quoteProducts: Readonly<Record<string, string | null>> = {
    panel: row.quotation.panelProductId,
    inverter: row.quotation.inverterProductId,
    battery: row.quotation.batteryProductId,
  };
  return {
    project: row.project,
    lines: lines.filter((line) => isMaterialCategory(line.category)),
    quoteProducts,
  };
}

export type QuoteMaterial = Awaited<ReturnType<typeof quoteMaterial>>;

/**
 * Which quotation line an issued item serves: the line naming that exact product, else
 * the line asked for, else the only line of the product's category, else none (an extra).
 */
export function resolveLineKey(
  quote: QuoteMaterial,
  product: typeof products.$inferSelect,
  requested: string | null,
): string | null {
  const has = (key: string) => quote.lines.some((line) => line.key === key);
  const named = Object.entries(quote.quoteProducts).find(
    ([key, id]) => id === product.id && has(key),
  );
  if (named) return named[0];
  if (requested && has(requested)) return requested;
  const sameCategory = quote.lines.filter((line) => line.category === product.category);
  return sameCategory.length === 1 ? (sameCategory[0]?.key ?? null) : null;
}

const totalsOf = (rows: readonly CustodyEntryRow[]) =>
  custodyTotals(rows.map((row) => ({ kind: row.kind, quantity: row.line.quantity })));
const namesOf = (rows: readonly CustodyEntryRow[]) => [
  ...new Set(rows.map((row) => row.product.name)),
];

function lineRow(
  line: QuoteLine,
  quote: QuoteMaterial,
  entries: readonly CustodyEntryRow[],
  reservations: readonly (typeof stockReservations.$inferSelect)[],
  installed: boolean,
): ReconciliationRow {
  const mine = entries.filter((entry) => entry.line.lineKey === line.key);
  const totals = totalsOf(mine);
  const productId = quote.quoteProducts[line.key] ?? null;
  const held = (status: (typeof stockReservations.$inferSelect)['status']) =>
    productId
      ? roundQuantity(
          reservations
            .filter((row) => row.productId === productId && row.status === status)
            .reduce((sum, row) => sum + row.quantity, 0),
        )
      : null;
  const reconciled = reconcileLine({ needed: line.quantity, ...totals, installed });
  return {
    lineKey: line.key,
    description: line.description,
    category: line.category,
    unit: line.unit,
    quoteProductId: productId,
    productNames: namesOf(mine),
    productIds: [...new Set(mine.map((row) => row.product.id))],
    needed: line.quantity,
    reserved: held('active'),
    dispatched: held('dispatched'),
    issued: totals.issued,
    used: totals.used,
    returned: totals.returned,
    withContractor: reconciled.withContractor,
    difference: installed || totals.used > 0 ? reconciled.difference : null,
    warning: reconciled.warning,
  };
}

/** Items issued that serve no quotation line, one row per product. */
function extraRows(
  entries: readonly CustodyEntryRow[],
  known: ReadonlySet<string>,
  installed: boolean,
): ReconciliationRow[] {
  const extras = entries.filter((entry) => !entry.line.lineKey || !known.has(entry.line.lineKey));
  const byProduct = new Map<string, CustodyEntryRow[]>();
  for (const entry of extras)
    byProduct.set(entry.product.id, [...(byProduct.get(entry.product.id) ?? []), entry]);
  return [...byProduct.values()].flatMap((group) => {
    const first = group[0];
    if (!first) return [];
    const totals = totalsOf(group);
    const unaccounted = installed && Math.abs(totals.balance) > 0.0005;
    return [
      {
        lineKey: null,
        description: first.product.name,
        category: first.product.category,
        unit: first.product.unit,
        quoteProductId: null,
        productNames: [first.product.name],
        productIds: [first.product.id],
        needed: null,
        reserved: null,
        dispatched: null,
        issued: totals.issued,
        used: totals.used,
        returned: totals.returned,
        withContractor: totals.balance,
        difference: null,
        warning: unaccounted ? 'unaccounted' : null,
      },
    ];
  });
}

/** Contractors with a live work order on the project: who material can go to. */
export async function projectContractors(db: DatabaseExecutor, projectId: string) {
  const rows = await db
    .select({ id: contractors.id, name: contractors.name, workOrderNumber: workOrders.number })
    .from(workOrders)
    .innerJoin(contractors, eq(contractors.id, workOrders.contractorId))
    .where(and(eq(workOrders.projectId, projectId), ne(workOrders.status, 'cancelled')))
    .orderBy(asc(contractors.name), asc(workOrders.number));
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

/** From quotation to roof, per line: needed, held, sent, issued, used, returned. */
export async function projectCustody(
  db: DatabaseExecutor,
  projectId: string,
): Promise<ProjectCustody> {
  const quote = await quoteMaterial(db, projectId);
  const entries = await custodyEntries(db, eq(materialSlips.projectId, projectId));
  const reservations = await db
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.projectId, projectId));
  const installed = (await installedProjects(db, [projectId])).has(projectId);
  const known = new Set(quote.lines.map((line) => line.key));
  return {
    projectId,
    projectCode: quote.project.code,
    installed,
    rows: [
      ...quote.lines.map((line) => lineRow(line, quote, entries, reservations, installed)),
      ...extraRows(entries, known, installed),
    ],
    holdings: await custodyProjects(db, entries),
    slips: await slipList(db, eq(materialSlips.projectId, projectId)),
    contractors: await projectContractors(db, projectId),
  };
}

/** Everything one contractor holds, per project, with its recent slips. */
export async function contractorMaterial(
  db: DatabaseExecutor,
  contractorId: string,
): Promise<ContractorMaterial> {
  const [contractor] = await db
    .select({ id: contractors.id, name: contractors.name })
    .from(contractors)
    .where(eq(contractors.id, contractorId));
  if (!contractor) throw notFound('That contractor');
  const where = eq(materialSlips.contractorId, contractorId);
  return {
    contractor,
    projects: await custodyProjects(db, await custodyEntries(db, where)),
    slips: await slipList(db, where, 60),
  };
}
