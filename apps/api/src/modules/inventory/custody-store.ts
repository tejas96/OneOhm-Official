import { type products, stockSerials, type Transaction } from '@oneohm/database';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import { moveStock } from './stock-ledger';

export interface StoreMove {
  readonly projectId: string;
  readonly locationId: string;
  readonly product: typeof products.$inferSelect;
  readonly quantity: number;
  readonly slip: { id: string; number: string };
  readonly userId: string;
}

/** The project's held units first, then the oldest free ones at that store. */
export async function issueSerials(tx: Transaction, move: StoreMove): Promise<string[]> {
  const units = await tx
    .select({ id: stockSerials.id, serial: stockSerials.serial })
    .from(stockSerials)
    .where(
      and(
        eq(stockSerials.productId, move.product.id),
        eq(stockSerials.locationId, move.locationId),
        sql`(${stockSerials.status} = 'in_stock' or (${stockSerials.status} = 'reserved' and ${stockSerials.projectId} = ${move.projectId}))`,
      ),
    )
    .orderBy(desc(stockSerials.status), asc(stockSerials.createdAt), asc(stockSerials.serial))
    .limit(move.quantity)
    .for('update');
  if (units.length < move.quantity)
    throw conflict('Some units in stock have no serial number; correct the stock count first.');
  await tx
    .update(stockSerials)
    .set({ status: 'dispatched', projectId: move.projectId, updatedAt: new Date() })
    .where(
      inArray(
        stockSerials.id,
        units.map((unit) => unit.id),
      ),
    );
  return units.map((unit) => unit.serial).sort();
}

/** Unused material back on the shelf; serialised units become free stock again. */
export async function putBackInStore(
  tx: Transaction,
  move: StoreMove & { readonly serials: readonly string[] },
): Promise<void> {
  await moveStock(tx, {
    productId: move.product.id,
    label: move.product.name,
    locationId: move.locationId,
    kind: 'return',
    onHand: move.quantity,
    reserved: 0,
    projectId: move.projectId,
    referenceId: move.slip.id,
    note: move.slip.number,
    userId: move.userId,
  });
  if (move.serials.length === 0) return;
  await tx
    .update(stockSerials)
    .set({
      status: 'in_stock',
      locationId: move.locationId,
      projectId: null,
      dispatchId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stockSerials.productId, move.product.id),
        inArray(stockSerials.serial, [...move.serials]),
      ),
    );
}
