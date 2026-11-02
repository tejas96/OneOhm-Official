import { type DatabaseExecutor, products, quotationInverters, quotations } from '@oneohm/database';
import { type InverterPick, inverterPicks, MAX_INVERTER_MODELS } from '@oneohm/domain';
import { asc, inArray } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';

/**
 * The inverters an input asks for, one row per model. Older clients send one
 * `inverterProductId`; that reads as one inverter.
 */
export function requiredInverterPicks(input: {
  readonly inverters?: readonly InverterPick[] | null | undefined;
  readonly inverterProductId?: string | null | undefined;
}): InverterPick[] {
  const picks = inverterPicks(input);
  if (picks.length === 0) {
    throw invalid('Choose at least one inverter.', { inverters: 'Choose an inverter.' });
  }
  if (picks.length > MAX_INVERTER_MODELS) {
    throw invalid(`A quotation can list up to ${MAX_INVERTER_MODELS} inverter models.`, {
      inverters: 'Remove an inverter model.',
    });
  }
  return picks;
}

/** Rows for `quotation_inverters`, in the order picked. */
export function inverterRows(quotationId: string, picks: readonly InverterPick[]) {
  return picks.map((pick, position) => ({
    quotationId,
    position,
    productId: pick.productId,
    quantity: pick.quantity,
  }));
}

/**
 * Each quotation's inverters, in the order picked. A quotation with no rows (saved before
 * inverter rows existed and not yet copied over) reads as its one main inverter.
 */
export async function invertersByQuotation(
  db: DatabaseExecutor,
  quotationIds: readonly string[],
): Promise<Map<string, InverterPick[]>> {
  const result = new Map<string, InverterPick[]>();
  const ids = [...new Set(quotationIds)];
  if (ids.length === 0) return result;
  const rows = await db
    .select({
      quotationId: quotationInverters.quotationId,
      productId: quotationInverters.productId,
      quantity: quotationInverters.quantity,
    })
    .from(quotationInverters)
    .where(inArray(quotationInverters.quotationId, ids))
    .orderBy(asc(quotationInverters.quotationId), asc(quotationInverters.position));
  for (const row of rows) {
    const list = result.get(row.quotationId) ?? [];
    list.push({ productId: row.productId, quantity: row.quantity });
    result.set(row.quotationId, list);
  }
  const missing = ids.filter((id) => !result.has(id));
  if (missing.length > 0) {
    const mains = await db
      .select({ id: quotations.id, inverter: quotations.inverterProductId })
      .from(quotations)
      .where(inArray(quotations.id, missing));
    for (const main of mains) result.set(main.id, [{ productId: main.inverter, quantity: 1 }]);
  }
  return result;
}

/** One quotation's inverters, in the order picked. */
export async function invertersOf(
  db: DatabaseExecutor,
  quotationId: string,
): Promise<InverterPick[]> {
  return (await invertersByQuotation(db, [quotationId])).get(quotationId) ?? [];
}

export type ProductRow = typeof products.$inferSelect;

/** Each picked inverter's catalog row with how many, in the order picked. */
export async function inverterProducts(
  db: DatabaseExecutor,
  picks: readonly InverterPick[],
): Promise<{ readonly product: ProductRow; readonly quantity: number }[]> {
  if (picks.length === 0) return [];
  const rows = await db
    .select()
    .from(products)
    .where(
      inArray(
        products.id,
        picks.map((pick) => pick.productId),
      ),
    );
  return picks.flatMap((pick) => {
    const product = rows.find((row) => row.id === pick.productId);
    return product ? [{ product, quantity: pick.quantity }] : [];
  });
}
