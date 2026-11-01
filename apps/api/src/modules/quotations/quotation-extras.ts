import type { ExtraLineInput } from '@oneohm/api-contracts';
import type { products } from '@oneohm/database';
import type { ExtraLine, RateCard, SavedLinePrice } from '@oneohm/domain';

type ProductRow = typeof products.$inferSelect;

/**
 * Hand-added lines as the price engine takes them. A catalog pick takes the catalog's
 * price, cost and GST; re-pricing an accepted quotation keeps what it saved; a typed
 * line is taxed as a service (charges) or as goods (everything else).
 */
export function resolveExtras(
  extras: readonly ExtraLineInput[],
  context: {
    readonly rates: RateCard;
    readonly products: ReadonlyMap<string, ProductRow>;
    readonly saved?: readonly SavedLinePrice[] | undefined;
  },
): ExtraLine[] {
  return extras.map((extra, index) => {
    const product = extra.productId ? context.products.get(extra.productId) : undefined;
    const saved = context.saved?.find((line) => line.key === `extra_${index + 1}`);
    const base = {
      kind: extra.kind,
      description: extra.description,
      category: product?.category ?? 'other',
      quantity: extra.quantity,
      unit: product?.unit ?? extra.unit,
      reason: extra.reason,
    } as const;
    if (saved) {
      return {
        ...base,
        unitPricePaise: saved.unitPricePaise,
        unitCostPaise: saved.unitCostPaise,
        taxRateBp: saved.taxRateBp,
      };
    }
    if (product) {
      return {
        ...base,
        unitPricePaise: product.pricePaise,
        unitCostPaise: product.costPaise,
        taxRateBp: product.taxRateBp,
      };
    }
    return {
      ...base,
      unitPricePaise: extra.unitPricePaise,
      unitCostPaise: extra.unitCostPaise,
      taxRateBp: extra.kind === 'charge' ? context.rates.serviceTaxBp : context.rates.goodsTaxBp,
    };
  });
}
