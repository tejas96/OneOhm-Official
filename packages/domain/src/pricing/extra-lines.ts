import type { ExtraKind, LineCategory, QuoteLineInput } from './quote-pricing';

/** A line sales adds by hand, as saved on the quotation (amounts in paise). */
export interface ExtraLine {
  readonly kind: ExtraKind;
  readonly description: string;
  readonly category: LineCategory;
  readonly quantity: number;
  readonly unit: string;
  /** What the customer pays per unit; ignored for gifts, negative only for adjustments. */
  readonly unitPricePaise: number;
  /** What it costs OneOhm per unit; this is what a gift costs. */
  readonly unitCostPaise: number;
  readonly taxRateBp: number;
  readonly reason: string;
}

export type ExtraLineProblem = 'reason_needed' | 'negative_price' | 'zero_adjustment';

/** Anything that changes the price or the cost needs a reason (PRD 3.9 manual adjustment). */
export const extraNeedsReason = (kind: ExtraKind): boolean => kind !== 'optional';

/** Why an extra line cannot be saved as it is, or null when it is fine. */
export function extraLineProblem(extra: ExtraLine): ExtraLineProblem | null {
  if (extraNeedsReason(extra.kind) && extra.reason.trim().length < 3) return 'reason_needed';
  if (extra.kind === 'adjustment') {
    return extra.unitPricePaise === 0 ? 'zero_adjustment' : null;
  }
  return extra.unitPricePaise < 0 ? 'negative_price' : null;
}

/** Extra lines as the price engine takes them, after the engine's own lines. */
export function extraQuoteLines(extras: readonly ExtraLine[]): QuoteLineInput[] {
  return extras.map((extra, index) => ({
    key: `extra_${index + 1}`,
    description: extra.description,
    category: extra.category,
    quantity: extra.kind === 'adjustment' ? 1 : extra.quantity,
    unit: extra.unit,
    unitPricePaise: extra.kind === 'gift' ? 0 : extra.unitPricePaise,
    unitCostPaise: extra.kind === 'adjustment' ? 0 : extra.unitCostPaise,
    taxRateBp: extra.taxRateBp,
    basis: 'catalog',
    extra: extra.kind,
  }));
}
