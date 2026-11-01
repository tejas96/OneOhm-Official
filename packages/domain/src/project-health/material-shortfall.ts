const EPSILON = 0.0005;

/** One item the accepted quotation needs, and how much of it is already secured. */
export interface MaterialPosition {
  readonly productId: string;
  /** What the quotation needs (modules, inverter, battery). */
  readonly needed: number;
  /** Held for the project: reserved, dispatched or issued to its crew. */
  readonly held: number;
  /** Still to arrive on the project's own purchase orders. */
  readonly onOrder: number;
}

/**
 * Material a project is short of (PRD 3.1 procurement risk): what the quotation needs,
 * less what is already held for it and what its open purchase orders will still bring.
 * Free store stock does not count until someone reserves it.
 */
export function materialShortfall(
  positions: readonly MaterialPosition[],
): { readonly productId: string; readonly short: number }[] {
  return positions
    .map((row) => ({
      productId: row.productId,
      short: Math.round((row.needed - row.held - row.onOrder) * 1000) / 1000,
    }))
    .filter((row) => row.short > EPSILON);
}
