import {
  type products,
  stockLevels,
  type stockLocations,
  stockReservations,
  stockSerials,
  type Transaction,
} from '@oneohm/database';
import { roundQuantity, shortages } from '@oneohm/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AppError, conflict } from '../../common/http/errors';

const formatQuantity = (value: number) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 3 });

interface Need {
  readonly productId: string;
  readonly quantity: number;
}

/** What is still to reserve: the quotation's needs less what is held, sent or issued. */
export async function outstandingNeeds(
  tx: Transaction,
  projectId: string,
  needs: readonly Need[],
): Promise<Need[]> {
  const held = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.projectId, projectId),
        inArray(stockReservations.status, ['active', 'dispatched', 'issued']),
      ),
    );
  return needs
    .map((need) => ({
      productId: need.productId,
      quantity: roundQuantity(
        need.quantity -
          held
            .filter((row) => row.productId === need.productId)
            .reduce((sum, row) => sum + row.quantity, 0),
      ),
    }))
    .filter((need) => need.quantity > 0);
}

/** 409 naming every product the location cannot cover from free stock. */
export async function assertCovered(
  tx: Transaction,
  location: typeof stockLocations.$inferSelect,
  outstanding: readonly Need[],
  catalog: readonly (typeof products.$inferSelect)[],
): Promise<void> {
  const levels = await tx.select().from(stockLevels).where(eq(stockLevels.locationId, location.id));
  const free = new Map(
    levels.map((row) => [row.productId, Math.max(0, row.onHand - row.reserved)] as const),
  );
  const short = shortages(outstanding, free);
  if (short.length === 0) return;
  const name = (id: string) => catalog.find((row) => row.id === id)?.name ?? 'Item';
  throw new AppError(
    409,
    `${location.name} cannot cover this project yet. Raise a purchase order for what is short.`,
    'shortage',
    Object.fromEntries(
      short.map((row) => [
        row.productId,
        `${name(row.productId)}: needs ${formatQuantity(row.needed)}, ${formatQuantity(row.available)} free`,
      ]),
    ),
  );
}

export function activeReservations(tx: Transaction, projectId: string) {
  return tx
    .select()
    .from(stockReservations)
    .where(and(eq(stockReservations.projectId, projectId), eq(stockReservations.status, 'active')))
    .for('update');
}

/** Holds the oldest units in stock for the project, one serial per unit. */
export async function holdSerials(
  tx: Transaction,
  target: { productId: string; locationId: string; projectId: string },
  quantity: number,
): Promise<void> {
  const units = await tx
    .select({ id: stockSerials.id })
    .from(stockSerials)
    .where(
      and(
        eq(stockSerials.productId, target.productId),
        eq(stockSerials.locationId, target.locationId),
        eq(stockSerials.status, 'in_stock'),
      ),
    )
    .orderBy(asc(stockSerials.createdAt), asc(stockSerials.serial))
    .limit(quantity)
    .for('update');
  if (units.length < quantity) {
    throw conflict('Some units in stock have no serial number; correct the stock count first.');
  }
  await tx
    .update(stockSerials)
    .set({ status: 'reserved', projectId: target.projectId, updatedAt: new Date() })
    .where(
      inArray(
        stockSerials.id,
        units.map((unit) => unit.id),
      ),
    );
}
