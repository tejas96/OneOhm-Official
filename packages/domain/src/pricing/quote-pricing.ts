/**
 * The central price calculation (PRD 3.9). Every module that shows a price calls
 * this; nothing else adds up quotation money. Amounts are integer paise; tax and
 * contingency rates are basis points (500 = 5%).
 */
export const LINE_CATEGORIES = [
  'panel',
  'inverter',
  'battery',
  'structure',
  'cable',
  'electrical',
  'installation',
  'transport',
  'liaisoning',
  'other',
] as const;
export type LineCategory = (typeof LINE_CATEGORIES)[number];

/** Where a quantity came from: a catalog pick, a site-type default, or the survey. */
export type QuantityBasis = 'catalog' | 'default' | 'survey';

export interface QuoteLineInput {
  readonly key: string;
  readonly description: string;
  readonly category: LineCategory;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPricePaise: number;
  readonly unitCostPaise: number;
  readonly taxRateBp: number;
  readonly basis: QuantityBasis;
}

export interface PricedLine extends QuoteLineInput {
  readonly amountPaise: number;
  readonly contingencyPaise: number;
  readonly discountPaise: number;
  readonly taxPaise: number;
  readonly totalPaise: number;
  readonly costPaise: number;
}

export interface QuotePricing {
  readonly lines: readonly PricedLine[];
  readonly subtotalPaise: number;
  readonly contingencyPaise: number;
  readonly discountPaise: number;
  readonly taxPaise: number;
  readonly totalPaise: number;
  readonly costPaise: number;
  readonly marginPaise: number;
}

const BP = 10_000;
/** Quotations show whole rupees: every computed amount is rounded to the rupee. */
const toRupee = (paise: number) => Math.round(paise / 100) * 100;

/** Prices every line, spreads the discount by value before tax, then adds tax per line. */
export function priceQuote(
  lines: readonly QuoteLineInput[],
  options: { readonly contingencyBp: number; readonly discountPaise: number },
): QuotePricing {
  const staged = lines.map((line) => {
    const amountPaise = toRupee(line.quantity * line.unitPricePaise);
    const contingencyPaise =
      line.basis === 'default' ? toRupee((amountPaise * options.contingencyBp) / BP) : 0;
    return { line, amountPaise, contingencyPaise, base: amountPaise + contingencyPaise };
  });
  const base = staged.reduce((sum, entry) => sum + entry.base, 0);
  const discount = toRupee(Math.min(Math.max(0, options.discountPaise), base));

  let discountLeft = discount;
  const priced = staged.map((entry, index): PricedLine => {
    const last = index === staged.length - 1;
    const share = last ? discountLeft : base > 0 ? toRupee((discount * entry.base) / base) : 0;
    discountLeft -= share;
    const net = entry.base - share;
    const taxPaise = toRupee((net * entry.line.taxRateBp) / BP);
    return {
      ...entry.line,
      amountPaise: entry.amountPaise,
      contingencyPaise: entry.contingencyPaise,
      discountPaise: share,
      taxPaise,
      totalPaise: net + taxPaise,
      costPaise: Math.round(entry.line.quantity * entry.line.unitCostPaise),
    };
  });

  const sum = (pick: (line: PricedLine) => number) => priced.reduce((acc, l) => acc + pick(l), 0);
  const costPaise = sum((line) => line.costPaise);
  const netPaise = base - discount;
  return {
    lines: priced,
    subtotalPaise: sum((line) => line.amountPaise),
    contingencyPaise: sum((line) => line.contingencyPaise),
    discountPaise: discount,
    taxPaise: sum((line) => line.taxPaise),
    totalPaise: sum((line) => line.totalPaise),
    costPaise,
    marginPaise: netPaise - costPaise,
  };
}

export interface SurveyVariance {
  readonly variancePaise: number;
  readonly varianceBp: number;
  /** Within tolerance the customer sees no change; beyond it a revision needs approval. */
  readonly withinTolerance: boolean;
}

/** Compares the accepted price with the price recalculated from survey measurements. */
export function compareWithSurvey(
  acceptedTotalPaise: number,
  surveyedTotalPaise: number,
  toleranceBp: number,
): SurveyVariance {
  const variancePaise = surveyedTotalPaise - acceptedTotalPaise;
  const varianceBp =
    acceptedTotalPaise > 0 ? Math.round((variancePaise * BP) / acceptedTotalPaise) : 0;
  return { variancePaise, varianceBp, withinTolerance: Math.abs(varianceBp) <= toleranceBp };
}
