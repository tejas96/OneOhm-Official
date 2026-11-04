import { type CostingCard, type CostingDetail, detailProblems } from '@oneohm/domain';

/** A draft or sent quote and the measured detail it was priced with. */
export interface OpenQuoteDetail {
  readonly number: string;
  readonly costing: unknown;
}

/**
 * The open quotes a rate card change would break: their detail names a rate the new card
 * no longer has (removed, or changed to another kind), so they could not be priced again.
 */
export function quotesBrokenBy(
  current: CostingCard,
  next: CostingCard,
  quotes: readonly OpenQuoteDetail[],
): string[] {
  return quotes
    .filter((quote) => {
      if (!quote.costing) return false;
      const detail = quote.costing as CostingDetail;
      return (
        detailProblems(next, detail).length > 0 && detailProblems(current, detail).length === 0
      );
    })
    .map((quote) => quote.number);
}
