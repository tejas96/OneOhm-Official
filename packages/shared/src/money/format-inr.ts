/**
 * Money is stored as integer paise (minor units). These helpers only format it.
 * Indian grouping throughout: ₹18,40,000 — never ₹1,840,000.
 */

const PAISE_PER_RUPEE = 100;
const LAKH = 100_000;
const CRORE = 10_000_000;

const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const withPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹18,40,000 (paise are dropped when they are zero, kept otherwise: ₹1,250.50). */
export function formatInr(paise: number): string {
  const rupees = paise / PAISE_PER_RUPEE;
  return Number.isInteger(rupees) ? wholeRupees.format(rupees) : withPaise.format(rupees);
}

/** Short form for tiles and charts: ₹8,500 · ₹18.4 L · ₹2.35 Cr. */
export function formatInrCompact(paise: number): string {
  const rupees = paise / PAISE_PER_RUPEE;
  const sign = rupees < 0 ? '−' : '';
  const absolute = Math.abs(rupees);
  if (absolute >= CRORE) return `${sign}₹${trimDecimals(absolute / CRORE, 2)} Cr`;
  if (absolute >= LAKH) return `${sign}₹${trimDecimals(absolute / LAKH, 1)} L`;
  return `${sign}${wholeRupees.format(Math.round(absolute))}`;
}

/** Rupees → paise, rounding to the nearest paisa. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

function trimDecimals(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, '');
}
