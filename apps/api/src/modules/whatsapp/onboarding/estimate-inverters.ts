import type { Product } from '@oneohm/api-contracts';

/** On-grid models before hybrid ones at the same rating, then the cheaper. */
export const onGridFirst = (inverters: readonly Product[]) =>
  inverters
    .filter((product) => product.active && product.ratedW)
    .sort(
      (left, right) =>
        (left.ratedW ?? 0) - (right.ratedW ?? 0) ||
        Number(/hybrid/i.test(left.name)) - Number(/hybrid/i.test(right.name)) ||
        left.pricePaise - right.pricePaise,
    )
    .map((product) => ({ id: product.id, ratedW: product.ratedW ?? 0 }));
