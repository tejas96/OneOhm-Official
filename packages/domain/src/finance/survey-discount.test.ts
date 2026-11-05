import { describe, expect, it } from 'vitest';
import { discountShares, discountTaxPaise, ratesOf } from './survey-discount';
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
