import { roundQuantity } from '@oneohm/domain';

/** Lines the quotation's own panel, inverter and battery picks already cover. */
const HEADER_KEYS = new Set(['panel', 'inverter', 'battery']);

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
    readonly inverterProductId: string;
    readonly batteryProductId: string | null;
  },
  stocked: readonly { key: string; productId: string | null; quantity: number }[],
) {
  return mergeNeeds([
    { productId: quotation.panelProductId, quantity: quotation.moduleCount },
    { productId: quotation.inverterProductId, quantity: 1 },
    ...(quotation.batteryProductId ? [{ productId: quotation.batteryProductId, quantity: 1 }] : []),
    ...stocked.flatMap((line) =>
      line.productId && !HEADER_KEYS.has(line.key)
        ? [{ productId: line.productId, quantity: line.quantity }]
        : [],
    ),
  ]);
}
