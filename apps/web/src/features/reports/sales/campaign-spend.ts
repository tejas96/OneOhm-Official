/** True when any campaign row had ad spend; with none, the money columns would be blank noise. */
export function hasAdSpend(rows: readonly { readonly spendPaise: number }[]): boolean {
  return rows.some((row) => row.spendPaise > 0);
}

/** "₹4.2" of sales for each ₹1 of ads; a dash when there was no spend. */
export function salesPerRupee(value: number | null): string {
  return value === null ? '—' : `₹${(Math.round(value * 10) / 10).toLocaleString('en-IN')}`;
}
