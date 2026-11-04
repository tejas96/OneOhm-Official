import {
  type CostingCard,
  KIND_CATEGORY,
  type RateKind,
  type RateLine,
  rateLineOf,
  taxOf,
} from './costing-card';
import type { RateNeed, UsedDetail } from './costing-detail';
import { round2 } from './costing-detail';
import type { QuantityBasis, QuoteLineInput } from './quote-pricing';

// The engine's line building: stages, needs merged per rate line, pricing rules.
const BP = 10_000;

/** Where each kind of line sits on the quotation; travel sits between equipment and services. */
export const STAGE: Readonly<Record<RateKind, number>> = {
  structure: 0,
  cable: 1,
  routing: 2,
  electrical: 3,
  labour: 4,
  equipment: 5,
  service: 7,
  other: 8,
};
export const TRAVEL_STAGE = 6;

export interface Staged {
  readonly stage: number;
  readonly order: number;
  readonly line: QuoteLineInput;
}

/** Needs merged into one line per rate line, labour scaled for site access. */
export function rateLines(
  rates: CostingCard,
  needs: readonly RateNeed[],
  access: UsedDetail['access'],
): Staged[] {
  const merged = new Map<string, { quantity: number; basis: QuantityBasis }>();
  for (const need of needs) {
    const seen = merged.get(need.rate);
    merged.set(need.rate, {
      quantity: (seen?.quantity ?? 0) + need.quantity,
      basis: seen ? strongerBasis(seen.basis, need.basis) : need.basis,
    });
  }
  const accessFactor = 1 + (rates.accessBp[access] ?? 0) / BP;
  return [...merged].flatMap(([key, need]) => {
    const rate = rateLineOf(rates, key);
    if (!rate || need.quantity <= 0) return [];
    const quantity = rate.kind === 'labour' ? need.quantity * accessFactor : need.quantity;
    return [
      {
        stage: STAGE[rate.kind],
        order: rates.rateLines.indexOf(rate),
        line: line(key, describe(rates, rate), KIND_CATEGORY[rate.kind], quantity, rate.unit, {
          price: rate.pricePaise,
          cost: rate.costPaise,
          tax: taxOf(rates, rate),
          basis: need.basis,
          productId: rate.productId,
        }),
      },
    ];
  });
}

/** An estimate anywhere makes the merged line an estimate. */
function strongerBasis(left: QuantityBasis, right: QuantityBasis): QuantityBasis {
  if (left === 'default' || right === 'default') return 'default';
  if (left === 'survey' || right === 'survey') return 'survey';
  return 'catalog';
}

function describe(rates: CostingCard, rate: RateLine): string {
  return rates.extraFloor.rate === rate.key
    ? `${rate.label} above floor ${rates.extraFloor.freeFloors}`
    : rate.label;
}

/** With a target margin, the price follows from cost: cost × (1 + overhead) ÷ (1 − margin). */
export function priced(rates: CostingCard, entry: QuoteLineInput): QuoteLineInput {
  if (rates.pricing.mode !== 'margin') return entry;
  const keep = Math.max(1, BP - rates.pricing.marginBp);
  const unitPricePaise = Math.round((entry.unitCostPaise * (BP + rates.overheadBp)) / keep);
  return { ...entry, unitPricePaise };
}

/**
 * With a target margin, a line with no cost would be quoted at ₹0. These lines need a
 * cost first (lines added by hand keep their own price, so they are left out).
 */
export function zeroCostLines(rates: CostingCard, lines: readonly QuoteLineInput[]): string[] {
  if (rates.pricing.mode !== 'margin') return [];
  return lines
    .filter((entry) => entry.extra === undefined && entry.quantity > 0 && entry.unitCostPaise <= 0)
    .map((entry) => entry.description);
}

export function line(
  key: string,
  description: string,
  category: QuoteLineInput['category'],
  quantity: number,
  unit: string,
  money: {
    readonly price: number;
    readonly cost: number;
    readonly tax: number;
    readonly basis: QuantityBasis;
    readonly productId?: string | null;
  },
): QuoteLineInput {
  return {
    key,
    description,
    category,
    quantity: round2(quantity),
    unit,
    unitPricePaise: money.price,
    unitCostPaise: money.cost,
    taxRateBp: money.tax,
    basis: money.basis,
    productId: money.productId ?? null,
  };
}
