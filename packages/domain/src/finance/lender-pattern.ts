/**
 * A lender's disbursement pattern (PRD 3.11, 7.2): how the bank pays its share, as parts
 * of the whole. A loan project's planned tranches follow it from the day it is created.
 */
export interface PatternPart {
  readonly label: string;
  /** Share of the bank's amount in basis points (10000 = all of it). */
  readonly shareBp: number;
}

export const SINGLE_DISBURSEMENT: readonly PatternPart[] = [
  { label: 'Full disbursement', shareBp: 10_000 },
];

/** The shipped pattern for lenders that pay in parts, until finance sets their own. */
export const DEFAULT_TRANCHE_PATTERN: readonly PatternPart[] = [
  { label: 'First disbursement', shareBp: 7000 },
  { label: 'Final disbursement', shareBp: 3000 },
];

/** The parts to plan for a lender: its own pattern, or the shipped one for its kind. */
export function patternFor(
  disbursement: 'single' | 'tranches',
  saved: readonly PatternPart[],
): readonly PatternPart[] {
  if (disbursement === 'single') return SINGLE_DISBURSEMENT;
  return saved.length > 0 ? saved : DEFAULT_TRANCHE_PATTERN;
}

/** Problems with a pattern, or null when the parts add up to the whole amount. */
export function checkPattern(parts: readonly PatternPart[]): string | null {
  if (parts.length === 0) return null;
  if (parts.length > 6) return 'Use at most 6 parts.';
  if (parts.some((part) => !part.label.trim())) return 'Name every part.';
  if (parts.some((part) => !Number.isInteger(part.shareBp) || part.shareBp <= 0))
    return 'Every part needs a share above 0%.';
  const total = parts.reduce((sum, part) => sum + part.shareBp, 0);
  return total === 10_000 ? null : 'The parts must add up to 100%.';
}

/** The bank's share split by the pattern, in paise; the last part takes any rounding. */
export function planTranches(
  bankSharePaise: number,
  parts: readonly PatternPart[],
): { label: string; amountPaise: number }[] {
  if (bankSharePaise <= 0 || parts.length === 0) return [];
  let left = bankSharePaise;
  return parts.map((part, index) => {
    const last = index === parts.length - 1;
    const amountPaise = last ? left : Math.round((bankSharePaise * part.shareBp) / 10_000);
    left -= amountPaise;
    return { label: part.label, amountPaise };
  });
}
