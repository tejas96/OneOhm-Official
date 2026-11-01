import type { PricedProduct } from './rate-card';

/** A priced line of an accepted quotation, as saved. */
export interface SavedLinePrice {
  readonly key: string;
  readonly unitPricePaise: number;
  readonly unitCostPaise: number;
  readonly taxRateBp: number;
}

/**
 * The product at the price it carried on the accepted quotation (PRD 3.9: rate changes
 * never silently change accepted quotations). Falls back to today's catalog price when
 * that line is missing.
 */
export function atAcceptedPrice<T extends PricedProduct>(
  product: T,
  lines: readonly SavedLinePrice[],
  key: 'panel' | 'inverter' | 'battery',
): T {
  const saved = lines.find((line) => line.key === key);
  if (!saved) return product;
  return {
    ...product,
    pricePaise: saved.unitPricePaise,
    costPaise: saved.unitCostPaise,
    taxRateBp: saved.taxRateBp,
  };
}
