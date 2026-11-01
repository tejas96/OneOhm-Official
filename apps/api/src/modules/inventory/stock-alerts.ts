import {
  type Notice,
  notifyHolders,
  products,
  stockLevels,
  stockThresholds,
  type Transaction,
} from '@oneohm/database';
import { available, fellBelowMinimum } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { eq, sql } from 'drizzle-orm';

const quantity = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 3 });

/**
 * Stock shortage alert (PRD 3.10): when a movement takes an item's free stock (all
 * locations) below its reorder level, the store and procurement hear once that day.
 */
export async function alertIfShort(
  tx: Transaction,
  move: { readonly productId: string; readonly onHand: number; readonly reserved: number },
): Promise<void> {
  if (move.onHand >= 0 && move.reserved <= 0) return;
  const [row] = await tx
    .select({ minimum: stockThresholds.minimum, name: products.name, unit: products.unit })
    .from(stockThresholds)
    .innerJoin(products, eq(products.id, stockThresholds.productId))
    .where(eq(stockThresholds.productId, move.productId))
    .limit(1);
  if (!row) return;
  const [totals] = await tx
    .select({
      onHand: sql<number>`coalesce(sum(${stockLevels.onHand}), 0)::float8`,
      reserved: sql<number>`coalesce(sum(${stockLevels.reserved}), 0)::float8`,
    })
    .from(stockLevels)
    .where(eq(stockLevels.productId, move.productId));
  const onHand = Number(totals?.onHand ?? 0);
  const reserved = Number(totals?.reserved ?? 0);
  const after = available({ onHand, reserved });
  const before = available({ onHand: onHand - move.onHand, reserved: reserved - move.reserved });
  if (!fellBelowMinimum(row.minimum, before, after)) return;
  const notice: Notice = {
    kind: 'stock_low',
    title: `${row.name} is running low`,
    body: `${quantity(after)} ${row.unit} free across the stores, below the reorder level of ${quantity(row.minimum)}. Raise a purchase request or order.`,
    subject: { type: 'stock', id: move.productId },
    dedupeKey: `stock-low:${move.productId}:${todayIn()}`,
  };
  await notifyHolders(tx, 'inventory.manage', notice);
  await notifyHolders(tx, 'procurement.manage', notice);
}
