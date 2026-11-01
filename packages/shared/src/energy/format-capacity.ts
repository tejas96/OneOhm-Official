/**
 * Solar capacity is stored in watts-peak (integer Wp) so sums never drift.
 * Shown as kWp with at most two decimals: 5400 → "5.4 kWp".
 */
export function formatKwp(wattsPeak: number): string {
  const kilowatts = wattsPeak / 1000;
  return `${Number(kilowatts.toFixed(2)).toLocaleString('en-IN')} kWp`;
}

/** A module's rating, e.g. 545 → "545 Wp". */
export function formatWp(wattsPeak: number): string {
  return `${Math.round(wattsPeak).toLocaleString('en-IN')} Wp`;
}
