import type { CustodyKindValue } from '@oneohm/api-contracts';
import {
  materialSlipLines,
  materialSlips,
  products,
  projectActivities,
  stockReservations,
  type Transaction,
} from '@oneohm/database';
import { isSerialised, roundQuantity } from '@oneohm/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { invalid, notFound } from '../../common/http/errors';
import { issueSerials, type StoreMove } from './custody-store';
import { moveStock, nextNumber } from './stock-ledger';

type Product = typeof products.$inferSelect;
const PREFIX = { issue: 'MI', use: 'MU', return: 'MR' } as const;

/** One contractor and project at a time, so two slips never draw the same balance. */
export async function lockCustody(tx: Transaction, contractorId: string, projectId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`oneohm:custody:${contractorId}:${projectId}`}))`,
  );
}

export async function productsById(tx: Transaction, ids: readonly string[]) {
  const rows = ids.length
    ? await tx
        .select()
        .from(products)
        .where(inArray(products.id, [...new Set(ids)]))
    : [];
  return (id: string): Product => {
    const product = rows.find((row) => row.id === id);
    if (!product) throw notFound('That item');
    return product;
  };
}

export interface SlipLine {
  readonly productId: string;
  readonly lineKey: string | null;
  readonly quantity: number;
  readonly serials: readonly string[];
}

/** The slip header with its number; lines are added as each one is taken or put back. */
export async function openSlip(
  tx: Transaction,
  slip: {
    kind: CustodyKindValue;
    contractorId: string;
    projectId: string;
    locationId?: string | null;
    dispatchId?: string | null;
    taskId?: string | null;
    occurredOn: string;
    note: string | null;
    userId: string;
  },
) {
  const number = await nextNumber(tx, 'material_slips', PREFIX[slip.kind], slip.occurredOn);
  const [row] = await tx
    .insert(materialSlips)
    .values({
      number,
      kind: slip.kind,
      contractorId: slip.contractorId,
      projectId: slip.projectId,
      locationId: slip.locationId ?? null,
      dispatchId: slip.dispatchId ?? null,
      taskId: slip.taskId ?? null,
      occurredOn: slip.occurredOn,
      note: slip.note,
      recordedByUserId: slip.userId,
    })
    .returning({ id: materialSlips.id, number: materialSlips.number });
  if (!row) throw new Error('Material slip insert returned nothing.');
  return row;
}

export async function addSlipLines(tx: Transaction, slipId: string, lines: readonly SlipLine[]) {
  if (lines.length === 0) return;
  await tx.insert(materialSlipLines).values(
    lines.map((line) => ({
      slipId,
      productId: line.productId,
      lineKey: line.lineKey,
      quantity: roundQuantity(line.quantity),
      serials: [...line.serials],
    })),
  );
}

export async function slipActivity(
  tx: Transaction,
  projectId: string,
  message: string,
  userId: string,
) {
  await tx.insert(projectActivities).values({ projectId, kind: 'material', message, userId });
}

/**
 * Out of the store for the project's contractor: the project's own reservation is used
 * first, then free stock. Every unit issued is recorded against the project as `issued`
 * so reserving later never asks for it again. Serialised items take their units too.
 */
export async function takeFromStore(tx: Transaction, move: StoreMove): Promise<string[]> {
  const { product, quantity, projectId, locationId } = move;
  if (isSerialised(product.category) && !Number.isInteger(quantity))
    throw invalid(`Issue whole units of ${product.name}.`);
  const own = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.projectId, projectId),
        eq(stockReservations.productId, product.id),
        eq(stockReservations.locationId, locationId),
        eq(stockReservations.status, 'active'),
      ),
    )
    .orderBy(asc(stockReservations.createdAt))
    .for('update');
  const held = roundQuantity(own.reduce((sum, row) => sum + row.quantity, 0));
  const fromHeld = Math.min(quantity, held);
  await moveStock(tx, {
    productId: product.id,
    label: product.name,
    locationId,
    kind: 'issue',
    onHand: -quantity,
    reserved: -fromHeld,
    projectId,
    referenceId: move.slip.id,
    note: move.slip.number,
    userId: move.userId,
  });
  const closed = await consumeReservations(tx, own, fromHeld);
  // Rows closed whole already say `issued`; the rest of the quantity gets its own row.
  const rest = roundQuantity(quantity - closed);
  if (rest > 0.0005) {
    await tx.insert(stockReservations).values({
      projectId,
      productId: product.id,
      locationId,
      quantity: rest,
      status: 'issued',
      createdByUserId: move.userId,
    });
  }
  return isSerialised(product.category) ? issueSerials(tx, move) : [];
}

/**
 * Uses `amount` of the project's active reservations, oldest first: a row used whole
 * becomes `issued`, a row used in part shrinks. Returns the quantity closed whole.
 */
async function consumeReservations(
  tx: Transaction,
  own: readonly (typeof stockReservations.$inferSelect)[],
  amount: number,
): Promise<number> {
  let left = amount;
  let closed = 0;
  for (const row of own) {
    if (left <= 0.0005) break;
    const take = Math.min(row.quantity, left);
    left = roundQuantity(left - take);
    const remaining = roundQuantity(row.quantity - take);
    if (remaining <= 0.0005) closed = roundQuantity(closed + row.quantity);
    await tx
      .update(stockReservations)
      .set(
        remaining <= 0.0005
          ? { status: 'issued', updatedAt: new Date() }
          : { quantity: remaining, updatedAt: new Date() },
      )
      .where(eq(stockReservations.id, row.id));
  }
  return closed;
}
