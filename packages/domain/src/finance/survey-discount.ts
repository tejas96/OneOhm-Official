import { allocateTax } from './ledger-postings';

/** The gross (taxable + GST) of the invoice lines at one GST rate. */
export interface RateGross {
  readonly taxRateBp: number;
  readonly grossPaise: number;
}

/** The self-survey discount at one GST rate: GST inclusive, so taxable + tax is the share of the discount. */
export interface DiscountShare {
  readonly taxRateBp: number;
  readonly taxablePaise: number;
  readonly taxPaise: number;
}

/**
 * The self-survey discount is GST inclusive and shown on the tax invoice (a line per GST rate): the
 * discount is shared over the rates by the value sold at each, and each share is split into taxable value
 * and GST at that rate. The invoice and the ledger both use this, so the GST they show is the same.
 */
export function discountShares(
  rates: readonly RateGross[],
  discountPaise: number,
): DiscountShare[] {
  if (discountPaise <= 0 || rates.length === 0) return [];
  const parts = allocateTax(
    rates.map((rate) => rate.grossPaise),
    discountPaise,
  );
  return rates.flatMap((rate, index) => {
    const share = parts[index] ?? 0;
    const taxPaise = Math.round((share * rate.taxRateBp) / (10_000 + rate.taxRateBp));
    return share > 0
      ? [{ taxRateBp: rate.taxRateBp, taxablePaise: share - taxPaise, taxPaise }]
      : [];
  });
}

/** The GST inside the discount: taken off the GST the milestones are booked with. */
export const discountTaxPaise = (rates: readonly RateGross[], discountPaise: number): number =>
  discountShares(rates, discountPaise).reduce((sum, share) => sum + share.taxPaise, 0);

/** The value sold at each GST rate, from the priced lines (value after discount, plus GST). */
export function ratesOf(
  lines: readonly {
    readonly amountPaise: number;
    readonly contingencyPaise: number;
    readonly discountPaise: number;
    readonly taxRateBp: number;
    readonly taxPaise: number;
  }[],
): RateGross[] {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    const gross = line.amountPaise + line.contingencyPaise - line.discountPaise + line.taxPaise;
    byRate.set(line.taxRateBp, (byRate.get(line.taxRateBp) ?? 0) + gross);
  }
  return [...byRate].map(([taxRateBp, grossPaise]) => ({ taxRateBp, grossPaise }));
}

/**
 * The GST one milestone is booked with when it falls due. Each takes its share of the project's GST by its
 * amount at that moment, but the last one to fall due takes whatever is left after the ones already booked, so
 * the milestones' GST always adds up to the invoice's GST exactly (a discount taken off a payment between two
 * due dates changes the amounts the earlier shares were worked from).
 */
export function milestoneGst(
  amounts: readonly number[],
  index: number,
  totalGstPaise: number,
  bookedPaise: number,
  last: boolean,
): number {
  if (last) return Math.max(0, totalGstPaise - bookedPaise);
  return allocateTax(amounts, totalGstPaise)[index] ?? 0;
}
