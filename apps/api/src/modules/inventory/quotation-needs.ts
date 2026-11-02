import { type InverterPick, isInverterLineKey, roundQuantity } from '@oneohm/domain';

/** Lines the quotation's own panel, inverter and battery picks already cover. */
const isHeaderKey = (key: string) => key === 'panel' || key === 'battery' || isInverterLineKey(key);

function mergeNeeds(needs: readonly { productId: string; quantity: number }[]) {
  const merged = new Map<string, number>();
  for (const need of needs)
    merged.set(need.productId, (merged.get(need.productId) ?? 0) + need.quantity);
  return [...merged].map(([productId, quantity]) => ({
    productId,
    quantity: roundQuantity(quantity),
  }));
}

/** A quotation's store needs from its picks and its priced lines that name a product. */
export function quotationNeeds(
  quotation: {
    readonly panelProductId: string;
    readonly moduleCount: number;
    /** Every inverter model with how many. */
    readonly inverters: readonly InverterPick[];
    readonly batteryProductId: string | null;
  },
  stocked: readonly { key: string; productId: string | null; quantity: number }[],
) {
  return mergeNeeds([
    { productId: quotation.panelProductId, quantity: quotation.moduleCount },
    ...quotation.inverters.map((pick) => ({ productId: pick.productId, quantity: pick.quantity })),
    ...(quotation.batteryProductId ? [{ productId: quotation.batteryProductId, quantity: 1 }] : []),
    ...stocked.flatMap((line) =>
      line.productId && !isHeaderKey(line.key)
        ? [{ productId: line.productId, quantity: line.quantity }]
        : [],
    ),
  ]);
}
