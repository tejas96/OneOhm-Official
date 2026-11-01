import { describe, expect, it } from 'vitest';
import { dcrReceiptProblem, needsCellDetails } from './dcr-receipt';
import { invoiceNeedsLook, matchVendorInvoice } from './invoice-match';

describe('vendor invoice matching', () => {
  it('waits until the invoice amount is entered', () => {
    expect(matchVendorInvoice({ expectedPaise: 1_000_000, invoicePaise: null })).toEqual({
      status: 'not_entered',
      differencePaise: 0,
    });
  });

  it('matches within a rupee of rounding either way', () => {
    expect(matchVendorInvoice({ expectedPaise: 1_000_049, invoicePaise: 1_000_000 }).status).toBe(
      'matches',
    );
    expect(matchVendorInvoice({ expectedPaise: 1_000_000, invoicePaise: 1_000_100 }).status).toBe(
      'matches',
    );
  });

  it('flags an invoice above or below the order, with the difference', () => {
    const higher = matchVendorInvoice({ expectedPaise: 1_000_000, invoicePaise: 1_050_000 });
    expect(higher).toEqual({ status: 'higher', differencePaise: 50_000 });
    expect(invoiceNeedsLook(higher)).toBe(true);
    const lower = matchVendorInvoice({ expectedPaise: 1_000_000, invoicePaise: 999_899 });
    expect(lower).toEqual({ status: 'lower', differencePaise: -101 });
    expect(invoiceNeedsLook(matchVendorInvoice({ expectedPaise: 5, invoicePaise: 5 }))).toBe(false);
  });
});

describe('DCR panels at goods receipt', () => {
  const line = {
    category: 'panel',
    dcr: true,
    quantity: 10,
    cellManufacturer: 'Premier Energies (test)',
    cellInvoiceNumber: 'PE/24/0091',
  };

  it('needs both cell details for accepted DCR panels', () => {
    expect(dcrReceiptProblem(line)).toBe(null);
    expect(dcrReceiptProblem({ ...line, cellManufacturer: '  ' })).toBe('cell_manufacturer');
    expect(dcrReceiptProblem({ ...line, cellInvoiceNumber: null })).toBe('cell_invoice');
  });

  it('asks nothing of non-DCR panels, other items or fully rejected lines', () => {
    const blank = { cellManufacturer: null, cellInvoiceNumber: null };
    expect(dcrReceiptProblem({ ...line, ...blank, dcr: false })).toBe(null);
    expect(dcrReceiptProblem({ ...line, ...blank, category: 'inverter' })).toBe(null);
    expect(dcrReceiptProblem({ ...line, ...blank, quantity: 0 })).toBe(null);
    expect(needsCellDetails({ category: 'panel', dcr: true, quantity: 1 })).toBe(true);
  });
});
