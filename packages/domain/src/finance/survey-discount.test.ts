import { describe, expect, it } from 'vitest';
import { discountShares, discountTaxPaise, milestoneGst, ratesOf } from './survey-discount';
import { buildTaxInvoice, type InvoiceLineInput } from './tax-invoice';

const line = (amountPaise: number, taxRateBp: number): InvoiceLineInput => ({
  description: 'x',
  hsnSac: null,
  quantity: 1,
  unit: 'nos',
  amountPaise,
  contingencyPaise: 0,
  discountPaise: 0,
  taxRateBp,
  taxPaise: Math.round((amountPaise * taxRateBp) / 10_000),
});

describe('the self-survey discount on the tax invoice', () => {
  const lines = [line(10_000_000, 500), line(2_000_000, 1800)];
  const rates = ratesOf(lines);

  it('is shared over the GST rates and split into taxable value and tax at each', () => {
    const shares = discountShares(rates, 100_000);
    expect(shares.map((one) => one.taxRateBp)).toEqual([500, 1800]);
    expect(shares.reduce((sum, one) => sum + one.taxablePaise + one.taxPaise, 0)).toBe(100_000);
    for (const share of shares)
      expect(share.taxPaise).toBe(
        Math.round(
          ((share.taxablePaise + share.taxPaise) * share.taxRateBp) / (10_000 + share.taxRateBp),
        ),
      );
    expect(discountShares(rates, 0)).toEqual([]);
  });

  it('makes the invoice total equal the quotation total less the discount, with the tax the milestones carry', () => {
    const quote = buildTaxInvoice(lines, 'intra_state');
    const discount = 100_000;
    const negative = discountShares(rates, discount).map((share) => ({
      ...line(0, share.taxRateBp),
      amountPaise: -share.taxablePaise,
      taxPaise: -share.taxPaise,
    }));
    const invoice = buildTaxInvoice([...lines, ...negative], 'intra_state');
    expect(invoice.totals.totalPaise).toBe(quote.totals.totalPaise - discount);
    expect(invoice.totals.taxPaise).toBe(quote.totals.taxPaise - discountTaxPaise(rates, discount));
  });
});

describe('the GST of a payment schedule when a discount is taken off between due dates', () => {
  it('adds up to the invoice GST exactly: the last to fall due takes what is left (two rates, 20/60/20, ₹1,000)', () => {
    const lines = [line(10_000_000, 500), line(2_000_000, 1800)];
    const rates = ratesOf(lines);
    const quote = buildTaxInvoice(lines, 'intra_state');
    const discount = 100_000;
    const totalGst = quote.totals.taxPaise - discountTaxPaise(rates, discount);
    const price = quote.totals.totalPaise;
    // 20% on acceptance, 60% before dispatch, 20% after installation; the discount comes off the dispatch payment
    // after the first has fallen due.
    const first = Math.round(price * 0.2);
    const second = Math.round(price * 0.6);
    const third = price - first - second;
    let booked = 0;
    const gst1 = milestoneGst([first, second, third], 0, totalGst, booked, false);
    booked += gst1;
    const after = [first, second - discount, third];
    const gst2 = milestoneGst(after, 1, totalGst, booked, false);
    booked += gst2;
    const gst3 = milestoneGst(after, 2, totalGst, booked, true);
    expect(gst1 + gst2 + gst3).toBe(totalGst);
    expect(gst3).toBeGreaterThanOrEqual(0);
  });
});
