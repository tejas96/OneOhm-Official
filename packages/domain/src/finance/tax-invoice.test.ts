import { amountInWords } from '@oneohm/shared';
import { describe, expect, it } from 'vitest';
import {
  gstStateByName,
  gstStateFromGstin,
  isValidGstin,
  splitGst,
  stateLabel,
  supplyTypeFor,
} from './gst-states';
import {
  buildTaxInvoice,
  type InvoiceLineInput,
  invoicePrefix,
  nextInvoiceNumberAfter,
  scheduleDifference,
} from './tax-invoice';

/** Three lines as the price engine writes them: goods at 5%, a service at 18%. */
const LINES: InvoiceLineInput[] = [
  {
    description: 'Mono PERC module (545 Wp, DCR)',
    hsnSac: '85414300',
    quantity: 6,
    unit: 'nos',
    amountPaise: 8_520_000,
    contingencyPaise: 0,
    discountPaise: 0,
    taxRateBp: 500,
    taxPaise: 426_000,
  },
  {
    description: 'Elevated RCC-roof structure',
    hsnSac: null,
    quantity: 3.27,
    unit: 'kW',
    amountPaise: 1_962_000,
    contingencyPaise: 157_000,
    discountPaise: 100_000,
    taxRateBp: 500,
    taxPaise: 101_000,
  },
  {
    description: 'Installation and commissioning',
    hsnSac: ' ',
    quantity: 1,
    unit: 'job',
    amountPaise: 1_308_000,
    contingencyPaise: 0,
    discountPaise: 0,
    taxRateBp: 1800,
    taxPaise: 235_400,
  },
];

describe('GST split', () => {
  it('halves the tax into CGST and SGST inside the state', () => {
    expect(splitGst(426_000, 'intra_state')).toEqual({
      cgstPaise: 213_000,
      sgstPaise: 213_000,
      igstPaise: 0,
    });
  });

  it('gives an odd paisa to CGST so the parts add up', () => {
    const split = splitGst(1_001, 'intra_state');
    expect(split).toEqual({ cgstPaise: 501, sgstPaise: 500, igstPaise: 0 });
    expect(split.cgstPaise + split.sgstPaise).toBe(1_001);
  });

  it('charges IGST on a supply to another state', () => {
    expect(splitGst(235_400, 'inter_state')).toEqual({
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 235_400,
    });
  });

  it('decides the supply type from the two states', () => {
    expect(supplyTypeFor('27', '27')).toBe('intra_state');
    expect(supplyTypeFor('27', '29')).toBe('inter_state');
  });
});

describe('states and GSTINs', () => {
  it('reads the state from a GSTIN and from an address', () => {
    expect(gstStateFromGstin('27AAECO5032B1ZW')?.name).toBe('Maharashtra');
    expect(gstStateByName(' maharashtra ')?.code).toBe('27');
    expect(gstStateByName('Orissa')?.name).toBe('Odisha');
    expect(gstStateByName('Atlantis')).toBeNull();
    const karnataka = gstStateByName('Karnataka');
    expect(karnataka && stateLabel(karnataka)).toBe('29-Karnataka');
  });

  it('checks the GSTIN format and its check character', () => {
    expect(isValidGstin('27AAECO5032B1ZW')).toBe(true);
    expect(isValidGstin('27aaeco5032b1zw')).toBe(true);
    expect(isValidGstin('27AAECO5032B1ZX')).toBe(false);
    expect(isValidGstin('99AAECO5032B1ZW')).toBe(false);
    expect(isValidGstin('27AAECO5032B1Z')).toBe(false);
  });
});

describe('tax invoice', () => {
  it('copies the quotation tax exactly and splits it inside the state', () => {
    const invoice = buildTaxInvoice(LINES, 'intra_state');
    const [panel, structure, service] = invoice.lines;
    expect(structure?.valuePaise).toBe(2_119_000);
    expect(structure?.taxablePaise).toBe(2_019_000);
    expect(structure?.totalPaise).toBe(2_120_000);
    expect(panel?.hsnSac).toBe('85414300');
    expect(service?.hsnSac).toBeNull();
    expect(service?.cgstPaise).toBe(117_700);
    expect(invoice.totals).toEqual({
      valuePaise: 11_947_000,
      discountPaise: 100_000,
      taxablePaise: 11_847_000,
      cgstPaise: 381_200,
      sgstPaise: 381_200,
      igstPaise: 0,
      taxPaise: 762_400,
      totalPaise: 12_609_400,
    });
  });

  it('summarises tax by rate', () => {
    const invoice = buildTaxInvoice(LINES, 'inter_state');
    expect(invoice.rates).toEqual([
      { taxRateBp: 500, taxablePaise: 10_539_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 527_000 },
      { taxRateBp: 1800, taxablePaise: 1_308_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 235_400 },
    ]);
    expect(invoice.totals.igstPaise).toBe(762_400);
  });

  it('shows how far the invoice is from the payment schedule', () => {
    expect(scheduleDifference(12_609_400, 12_609_400)).toBe(0);
    expect(scheduleDifference(12_609_400, 12_600_000)).toBe(9_400);
  });

  it('says the total in words the Indian way', () => {
    const { totals } = buildTaxInvoice(LINES, 'intra_state');
    expect(amountInWords(totals.totalPaise)).toBe(
      'Rupees One Lakh Twenty-Six Thousand Ninety-Four Only',
    );
    expect(amountInWords(18_301_500)).toBe('Rupees One Lakh Eighty-Three Thousand Fifteen Only');
    expect(amountInWords(1_23_45_678_50)).toBe(
      'Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only',
    );
  });
});

describe('invoice numbers', () => {
  it('runs per financial year without gaps', () => {
    expect(invoicePrefix('2026-11-01')).toBe('OH/INV/2026-27/');
    expect(nextInvoiceNumberAfter('2026-11-01', null)).toBe('OH/INV/2026-27/0001');
    expect(nextInvoiceNumberAfter('2026-11-01', 'OH/INV/2026-27/0001')).toBe('OH/INV/2026-27/0002');
    expect(nextInvoiceNumberAfter('2027-03-31', 'OH/INV/2026-27/0099')).toBe('OH/INV/2026-27/0100');
  });

  it('starts again at 0001 in April', () => {
    expect(nextInvoiceNumberAfter('2027-04-01', 'OH/INV/2026-27/0100')).toBe('OH/INV/2027-28/0001');
  });

  it('keeps counting past 9999', () => {
    expect(nextInvoiceNumberAfter('2026-11-01', 'OH/INV/2026-27/9999')).toBe(
      'OH/INV/2026-27/10000',
    );
  });
});
