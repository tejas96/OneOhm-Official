import type { QuotationPreviewInput } from '@oneohm/api-contracts';
import { detailProblems, type RateCard, zeroCostLines } from '@oneohm/domain';
import { invalid } from '../../common/http/errors';
import type { QuotedLine } from './quotation-totals';

/**
 * New and edited quotes may only use products in use. An archived product stays on the
 * quotes that already have it, but cannot be priced again.
 */
export function assertQuotable(
  product: { readonly active: boolean; readonly name: string },
  field: string,
): void {
  if (product.active) return;
  throw invalid(`${product.name} is archived, so it cannot go on a quote.`, {
    [field]: 'Pick a product that is in use.',
  });
}

/** A quotation's own detail may only name rates the card still has. */
export function assertDetailPriceable(rates: RateCard, input: QuotationPreviewInput): void {
  const problems = input.costing ? detailProblems(rates, input.costing) : [];
  if (problems.length === 0) return;
  throw invalid(
    'Some of this quotation’s detail names rates that are no longer on the rate card.',
    Object.fromEntries(problems.map((problem) => [problem.path.join('.'), problem.message])),
  );
}

/** Cost plus target margin prices from cost: an item with no cost would sell at ₹0. */
export function assertCostsKnown(rates: RateCard, lines: readonly QuotedLine[]): void {
  const free = zeroCostLines(rates, lines);
  if (free.length === 0) return;
  throw invalid(
    `Prices come from cost plus the target margin, but these have no cost yet, so they would be quoted at ₹0: ${free.join(', ')}. Add their cost in Settings → Products or the rate card.`,
  );
}
