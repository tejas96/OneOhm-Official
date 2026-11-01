import { notifyHolders, stockReservations, stockSerials, type Transaction } from '@oneohm/database';
import { isSerialised, type LineCategory, reservationExcess, roundQuantity } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { projectNeeds } from '../inventory/material-read';
import { activeReservations, outstandingNeeds } from '../inventory/reservation-helpers';
import { moveStock } from '../inventory/stock-ledger';

type Reservation = typeof stockReservations.$inferSelect;

const sum = (rows: readonly { quantity: number }[]) =>
  roundQuantity(rows.reduce((total, row) => total + row.quantity, 0));

/** Lets go of `quantity` of one product's reservation, newest rows first. */
async function release(
  tx: Transaction,
  rows: readonly Reservation[],
  quantity: number,
  move: { projectId: string; userId: string; serialised: boolean },
): Promise<void> {
  let left = quantity;
  for (const row of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (left <= 0) break;
    const take = roundQuantity(Math.min(left, row.quantity));
    left = roundQuantity(left - take);
    await moveStock(tx, {
      productId: row.productId,
      label: 'this item',
      locationId: row.locationId,
      kind: 'release',
      onHand: 0,
      reserved: -take,
      projectId: move.projectId,
      referenceId: row.id,
      note: 'Project scope changed',
      userId: move.userId,
    });
    const rest = roundQuantity(row.quantity - take);
    await tx
      .update(stockReservations)
      .set(
        rest > 0
          ? { quantity: rest, updatedAt: new Date() }
          : { status: 'released', updatedAt: new Date() },
      )
      .where(eq(stockReservations.id, row.id));
    if (move.serialised) {
      const units = await tx
        .select({ id: stockSerials.id })
        .from(stockSerials)
        .where(
          and(
            eq(stockSerials.projectId, move.projectId),
            eq(stockSerials.productId, row.productId),
            eq(stockSerials.locationId, row.locationId),
            eq(stockSerials.status, 'reserved'),
          ),
        )
        .limit(Math.round(take));
      if (units.length > 0)
        await tx
          .update(stockSerials)
          .set({ status: 'in_stock', projectId: null, updatedAt: new Date() })
          .where(
            inArray(
              stockSerials.id,
              units.map((unit) => unit.id),
            ),
          );
    }
  }
}

interface Held {
  readonly needs: readonly { productId: string; quantity: number }[];
  readonly catalog: readonly { id: string; name: string; category: string }[];
  readonly active: readonly Reservation[];
  readonly sent: readonly Reservation[];
}

/** One product: let go of what is held beyond the need; name what is at site beyond it. */
async function settleProduct(
  tx: Transaction,
  held: Held,
  productId: string,
  move: { projectId: string; userId: string },
): Promise<{ released: string | null; surplus: string | null }> {
  const need = held.needs.find((row) => row.productId === productId)?.quantity ?? 0;
  const mine = held.active.filter((row) => row.productId === productId);
  const sentOut = sum(held.sent.filter((row) => row.productId === productId));
  const excess = reservationExcess(need, sum(mine), sentOut);
  const product = held.catalog.find((row) => row.id === productId);
  const name = product?.name ?? 'item';
  if (excess > 0)
    await release(tx, mine, excess, {
      ...move,
      serialised: product ? isSerialised(product.category as LineCategory) : false,
    });
  return {
    released: excess > 0 ? `${excess} × ${name}` : null,
    surplus: sentOut > need ? `${roundQuantity(sentOut - need)} × ${name}` : null,
  };
}

const sentence = (parts: readonly string[]) => parts.filter(Boolean).join(' ');

/**
 * The store follows an accepted change (PRD 3.10): reservations beyond the new need are
 * let go, and the store is asked to hold what is now missing. Material already sent to
 * site beyond the need is named for the team to bring back. Returns a line for the history.
 */
export async function followChangeInStore(
  tx: Transaction,
  project: { readonly id: string; readonly code: string },
  changeId: string,
  userId: string,
): Promise<string> {
  const { needs, catalog } = await projectNeeds(tx, project.id);
  const active = await activeReservations(tx, project.id);
  const sent = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.projectId, project.id),
        inArray(stockReservations.status, ['dispatched', 'issued']),
      ),
    );
  if (active.length === 0 && sent.length === 0) return '';
  const released: string[] = [];
  const surplus: string[] = [];
  for (const productId of new Set([...active, ...sent].map((row) => row.productId))) {
    const settled = await settleProduct(tx, { needs, catalog, active, sent }, productId, {
      projectId: project.id,
      userId,
    });
    if (settled.released) released.push(settled.released);
    if (settled.surplus) surplus.push(settled.surplus);
  }
  const missing = await outstandingNeeds(tx, project.id, needs);
  const more =
    missing.length > 0 ? 'The accepted change needs more material: reserve the rest.' : '';
  const back =
    surplus.length > 0 ? `Already at site beyond the new need: ${surplus.join(', ')}.` : '';
  if (more || back)
    await notifyHolders(tx, 'inventory.manage', {
      kind: 'material_change',
      title: `Material changed on ${project.code}`,
      body: sentence([more, back]),
      subject: { type: 'project', id: project.id, projectId: project.id },
      dedupeKey: `material_change:${changeId}`,
    });
  return sentence([
    released.length > 0 ? `Released from the store: ${released.join(', ')}.` : '',
    more ? 'The store is asked to reserve the extra material.' : '',
    surplus.length > 0 ? `To bring back from site: ${surplus.join(', ')}.` : '',
  ]);
}
