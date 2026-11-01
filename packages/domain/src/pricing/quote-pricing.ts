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

/**
 * Lines sales adds by hand (PRD 3.5, 3.9): an optional item offered but not in the
 * total, a gift (free to the customer, its cost kept), a site-specific charge, or a
 * price adjustment up or down.
 */
export const EXTRA_KINDS = ['optional', 'gift', 'charge', 'adjustment'] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];

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
  /** Set only on lines added by hand. */
  readonly extra?: ExtraKind | undefined;
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
  /** Optional items, with GST: offered on the quotation, not in its total. */
  readonly optionalPaise: number;
  /** How far the price was lowered by hand: the discount plus downward adjustments. */
  readonly reductionPaise: number;
}

const BP = 10_000;
/** Quotations show whole rupees: every computed amount is rounded to the rupee. */
const toRupee = (paise: number) => Math.round(paise / 100) * 100;

/** In the total: everything except optional items. */
const counts = (line: QuoteLineInput) => line.extra !== 'optional';
/** Shares the discount: the engine's lines and site charges, not gifts or adjustments. */
const sharesDiscount = (line: QuoteLineInput) =>
  line.extra === undefined || line.extra === 'charge';

/**
 * Prices every line, spreads the discount by value before tax, then adds tax per line.
 * Gifts are free to the customer but their cost counts; optional items are priced for
 * the customer to see and left out of every total.
 */
export function priceQuote(
  lines: readonly QuoteLineInput[],
  options: { readonly contingencyBp: number; readonly discountPaise: number },
): QuotePricing {
  const staged = lines.map((line) => {
    const unitPrice = line.extra === 'gift' ? 0 : line.unitPricePaise;
    const amountPaise = toRupee(line.quantity * unitPrice);
    const contingencyPaise =
      line.basis === 'default' && line.extra === undefined
        ? toRupee((amountPaise * options.contingencyBp) / BP)
        : 0;
    return { line, amountPaise, contingencyPaise, base: amountPaise + contingencyPaise };
  });
  const sharing = staged.filter((entry) => counts(entry.line) && sharesDiscount(entry.line));
  const base = sharing.reduce((sum, entry) => sum + entry.base, 0);
  const discount = toRupee(Math.min(Math.max(0, options.discountPaise), base));

  let discountLeft = discount;
  const lastSharing = sharing.at(-1);
  const priced = staged.map((entry): PricedLine => {
    let share = 0;
    if (entry === lastSharing) share = discountLeft;
    else if (sharing.includes(entry) && base > 0) share = toRupee((discount * entry.base) / base);
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
  return totalsOf(priced, discount);
}

function totalsOf(priced: readonly PricedLine[], discount: number): QuotePricing {
  const included = priced.filter(counts);
  const sum = (from: readonly PricedLine[], pick: (line: PricedLine) => number) =>
    from.reduce((acc, line) => acc + pick(line), 0);
  const costPaise = sum(included, (line) => line.costPaise);
  const netPaise = sum(included, (line) => line.totalPaise - line.taxPaise);
  const loweredBy = sum(
    included.filter((line) => line.extra === 'adjustment'),
    (line) => Math.max(0, -line.amountPaise),
  );
  return {
    lines: priced,
    subtotalPaise: sum(included, (line) => line.amountPaise),
    contingencyPaise: sum(included, (line) => line.contingencyPaise),
    discountPaise: discount,
    taxPaise: sum(included, (line) => line.taxPaise),
    totalPaise: sum(included, (line) => line.totalPaise),
    costPaise,
    marginPaise: netPaise - costPaise,
    optionalPaise: sum(
      priced.filter((line) => !counts(line)),
      (line) => line.totalPaise,
    ),
    reductionPaise: discount + loweredBy,
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
