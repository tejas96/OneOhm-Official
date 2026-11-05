/** What a number box stores and shows: paise as rupees, basis points as percent. */
export type NumberUnit = 'paise' | 'basisPoints' | 'watts' | 'whole' | 'decimal';

/** Stored value → what the person types: paise as rupees, basis points as percent. */
export const SCALE: Readonly<Record<NumberUnit, number>> = {
  paise: 100,
  basisPoints: 100,
  watts: 1000,
  whole: 1,
  decimal: 1,
};

/** How many digits may follow the point (paise has two, so no half-paise is possible). */
const DECIMALS: Readonly<Record<NumberUnit, number>> = {
  paise: 2,
  basisPoints: 2,
  watts: 3,
  whole: 0,
  decimal: 3,
};

/** Digits before the point: ₹99,99,99,99,99,999 is already far beyond any real amount. */
const MAX_WHOLE_DIGITS = 12;

export function toText(value: number | null, unit: NumberUnit): string {
  if (value === null) return '';
  const shown = value / SCALE[unit];
  return Number.isInteger(shown) ? String(shown) : shown.toFixed(3).replace(/0+$/, '');
}

/**
 * Makes whatever was typed or pasted into a plain number text: digits and at most one
 * point. Letters, minus signs, ₹, %, spaces and commas (any grouping, "1,00,000" too)
 * are dropped; extra decimals and leading zeros are trimmed.
 */
export function cleanNumberText(raw: string, unit: NumberUnit): string {
  const withoutLabel = raw.replace(/^\s*(?:rs\.?|inr)(?![a-z])/i, '');
  const kept = withoutLabel.replace(/[^0-9.]/g, '');
  const point = kept.indexOf('.');
  const decimals = DECIMALS[unit];
  let whole = point === -1 ? kept : kept.slice(0, point);
  let fraction = point === -1 ? '' : kept.slice(point + 1).replace(/\./g, '');
  whole = whole.slice(0, MAX_WHOLE_DIGITS);
  fraction = fraction.slice(0, decimals);
  whole = whole.replace(/^0+(?=\d)/, '');
  const hasPoint = point !== -1 && decimals > 0;
  if (!hasPoint) return whole;
  return `${whole === '' && fraction !== '' ? '0' : whole}.${fraction}`;
}

/** The stored value for a cleaned text: null when empty, a non-negative whole number otherwise. */
export function valueOfText(text: string, unit: NumberUnit): number | null {
  if (text === '' || text === '.') return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  // `decimal` keeps what was typed (115.5); every other unit stores whole numbers.
  return unit === 'decimal' ? parsed : Math.round(parsed * SCALE[unit]);
}

/** One step for a change event: the text to show and the value to store. */
export function readNumberText(
  raw: string,
  unit: NumberUnit,
): { readonly text: string; readonly value: number | null } {
  const text = cleanNumberText(raw, unit);
  return { text, value: valueOfText(text, unit) };
}
