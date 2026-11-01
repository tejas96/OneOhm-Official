import {
  MAIN_STORE_CODE,
  projectFacts,
  stockLevels,
  stockLocations,
  stockMovements,
  type Transaction,
} from '@oneohm/database';
import { applyStockChange, type StockProblem } from '@oneohm/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AppError, notFound } from '../../common/http/errors';

export interface StockMove {
  readonly productId: string;
  /** Product name, for the error people read when a rule would break. */
  readonly label: string;
  readonly locationId: string;
  readonly kind: 'receipt' | 'reservation' | 'release' | 'dispatch' | 'adjustment';
  readonly onHand: number;
  readonly reserved: number;
  readonly projectId?: string | null;
  readonly referenceId?: string | null;
  readonly note?: string | null;
  readonly userId: string;
}

const PROBLEM: Readonly<Record<StockProblem, (label: string) => string>> = {
  negative_stock: (label) => `There is not enough ${label} in stock for this.`,
  negative_reserved: (label) => `Less ${label} is reserved than this releases.`,
  reserved_exceeds_stock: (label) => `Only the ${label} in stock can be reserved.`,
};

/**
 * The only way stock changes: locks the level row, checks the stock rules, updates it
 * and writes the ledger entry, all in the caller's transaction.
 */
export async function moveStock(tx: Transaction, move: StockMove): Promise<void> {
  await tx
    .insert(stockLevels)
    .values({ productId: move.productId, locationId: move.locationId })
    .onConflictDoNothing();
  const where = and(
    eq(stockLevels.productId, move.productId),
    eq(stockLevels.locationId, move.locationId),
  );
  const [level] = await tx.select().from(stockLevels).where(where).for('update');
  if (!level) throw new Error('Stock level row missing after insert.');
  const result = applyStockChange(level, { onHand: move.onHand, reserved: move.reserved });
  if ('problem' in result)
    throw new AppError(409, PROBLEM[result.problem](move.label), 'stock_rule');
  await tx
    .update(stockLevels)
    .set({ onHand: result.level.onHand, reserved: result.level.reserved, updatedAt: new Date() })
    .where(where);
  await tx.insert(stockMovements).values({
    productId: move.productId,
    locationId: move.locationId,
    kind: move.kind,
    onHandDelta: move.onHand,
    reservedDelta: move.reserved,
    projectId: move.projectId ?? null,
    referenceId: move.referenceId ?? null,
    note: move.note ?? null,
    userId: move.userId,
  });
}

/** The chosen location, or the main store when none is given. */
export async function resolveLocation(tx: Transaction, locationId: string | null) {
  const [location] = await tx
    .select()
    .from(stockLocations)
    .where(
      locationId ? eq(stockLocations.id, locationId) : eq(stockLocations.code, MAIN_STORE_CODE),
    )
    .limit(1);
  if (!location?.active) throw notFound('That store location');
  return location;
}

/** Next document number for the year, e.g. PO/2026/0007. Serialised per prefix. */
export async function nextNumber(
  tx: Transaction,
  table: 'purchase_orders' | 'goods_receipts' | 'dispatches',
  prefix: 'PO' | 'GRN' | 'DC',
  date: string,
): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`oneohm:${prefix}`}))`);
  const base = `${prefix}/${date.slice(0, 4)}/`;
  const result = await tx.execute<{ number: string }>(
    sql`select number from ${sql.identifier(table)} where number like ${`${base}%`} order by number desc limit 1`,
  );
  const last = result.rows[0]?.number;
  const next = last ? Number(last.slice(base.length)) + 1 : 1;
  return `${base}${String(next).padStart(4, '0')}`;
}

/**
 * Fills report facts from purchasing and the store. A fact a task already captured is
 * left alone: people's entries win over suggestions.
 */
export async function suggestFacts(
  tx: Transaction,
  projectId: string,
  facts: Readonly<Record<string, string | null | undefined>>,
): Promise<void> {
  for (const [key, raw] of Object.entries(facts)) {
    const value = raw?.trim();
    if (!value) continue;
    await tx
      .insert(projectFacts)
      .values({ projectId, key, value, capturedByTaskId: null })
      .onConflictDoUpdate({
        target: [projectFacts.projectId, projectFacts.key],
        set: { value, updatedAt: new Date() },
        setWhere: isNull(projectFacts.capturedByTaskId),
      });
  }
}
