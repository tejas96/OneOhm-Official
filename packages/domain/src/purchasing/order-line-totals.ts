/**
 * Purchase order line money, shared by the API (stored totals) and the web forms
 * (live totals while typing), so the two can never disagree.
 */
export interface PurchaseLineAmounts {
  readonly quantity: number;
  readonly ratePaise: number;
  /** GST rate in basis points (1800 = 18%). */
  readonly taxRateBp: number;
}

export interface PurchaseOrderTotals {
  readonly subtotalPaise: number;
  readonly taxPaise: number;
  readonly totalPaise: number;
}

/** A line's amount before GST: quantity × rate, rounded to the paisa. */
export function purchaseLineAmount(line: Pick<PurchaseLineAmounts, 'quantity' | 'ratePaise'>) {
  return Math.round(line.quantity * line.ratePaise);
}

/** GST on a line, worked out on the rounded amount and rounded to the paisa. */
export function purchaseLineTax(line: PurchaseLineAmounts): number {
  return Math.round((purchaseLineAmount(line) * line.taxRateBp) / 10_000);
}

/** A line's amount with GST: amount to the paisa, then GST on it. */
export function purchaseLineTotal(line: PurchaseLineAmounts): number {
  return purchaseLineAmount(line) + purchaseLineTax(line);
}

/** An order's subtotal, GST and total, summed line by line. */
export function purchaseOrderTotals(lines: readonly PurchaseLineAmounts[]): PurchaseOrderTotals {
  let subtotalPaise = 0;
  let totalPaise = 0;
  for (const line of lines) {
    subtotalPaise += purchaseLineAmount(line);
    totalPaise += purchaseLineTotal(line);
  }
  return { subtotalPaise, taxPaise: totalPaise - subtotalPaise, totalPaise };
}
