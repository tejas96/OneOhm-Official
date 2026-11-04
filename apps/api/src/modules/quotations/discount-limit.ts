/**
 * The largest discount sales may give without a manager (PRD 3.9). The discount comes
 * off the price before GST, so the limit is a share of that same price.
 */
export function discountLimitPaise(
  undiscounted: { readonly totalPaise: number; readonly taxPaise: number },
  limitBp: number,
): number {
  return Math.round(((undiscounted.totalPaise - undiscounted.taxPaise) * limitBp) / 10_000);
}
