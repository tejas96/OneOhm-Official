import { roundQuantity } from '../inventory/stock-rules';

/** The money lines a change moves, from the accepted quote and the changed one. */
export interface PriceSide {
  readonly totalPaise: number;
  readonly subsidyPaise: number;
  readonly subsidyIneligible: string | null;
  readonly stateSupportPaise: number;
  readonly effectivePaise: number;
  readonly capacityWp: number;
}

export interface PriceImpact {
  readonly before: PriceSide;
  readonly after: PriceSide;
  /** New price less old: what the customer's payments move by. */
  readonly differencePaise: number;
  readonly subsidyDifferencePaise: number;
  readonly stateSupportDifferencePaise: number;
  readonly effectiveDifferencePaise: number;
}

/**
 * The price, subsidy and effective cost before and after (PRD 3.15 "cost and subsidy
 * impact shown before approval"). The subsidy stays display only: the invoice is the full
 * price, so only the price difference moves the payment schedule.
 */
export function priceImpact(before: PriceSide, after: PriceSide): PriceImpact {
  return {
    before,
    after,
    differencePaise: after.totalPaise - before.totalPaise,
    subsidyDifferencePaise: after.subsidyPaise - before.subsidyPaise,
    stateSupportDifferencePaise: after.stateSupportPaise - before.stateSupportPaise,
    effectiveDifferencePaise: after.effectivePaise - before.effectivePaise,
  };
}

export interface MaterialNeed {
  readonly productId: string;
  readonly quantity: number;
}

export interface MaterialChange {
  readonly productId: string;
  readonly before: number;
  readonly after: number;
  /** More (+) or less (−) of it needed. */
  readonly delta: number;
}

const total = (needs: readonly MaterialNeed[], productId: string) =>
  roundQuantity(
    needs
      .filter((need) => need.productId === productId)
      .reduce((sum, need) => sum + need.quantity, 0),
  );

/** Only the products whose quantity changes, in the order they first appear. */
export function materialDelta(
  before: readonly MaterialNeed[],
  after: readonly MaterialNeed[],
): MaterialChange[] {
  const ids = [...new Set([...before, ...after].map((need) => need.productId))];
  return ids.flatMap((productId) => {
    const was = total(before, productId);
    const now = total(after, productId);
    const delta = roundQuantity(now - was);
    return delta === 0 ? [] : [{ productId, before: was, after: now, delta }];
  });
}

/**
 * How much of a product's store reservation to let go once a change lowers what the
 * project needs: what is held plus what already left the store, beyond the new need,
 * never more than is still held.
 */
export function reservationExcess(need: number, held: number, sentOut: number): number {
  return roundQuantity(Math.min(held, Math.max(0, held + sentOut - need)));
}
