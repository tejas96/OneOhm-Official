import { type SupplyType, splitGst } from './gst-states';
import { financialYear } from './receivable-ageing';

/**
 * The GST tax invoice for a project's full price (PRD 3.11), made from the accepted
 * quotation's priced lines. It copies their tax exactly, so the invoice total always
 * equals the quotation total; it only splits that tax into CGST + SGST or IGST.
 */
export interface InvoiceLineInput {
  readonly description: string;
  readonly hsnSac: string | null;
  readonly quantity: number;
  readonly unit: string;
  /** Quantity × price, before contingency and discount. */
  readonly amountPaise: number;
  readonly contingencyPaise: number;
  readonly discountPaise: number;
  readonly taxRateBp: number;
  readonly taxPaise: number;
}

export interface InvoiceLine {
  readonly description: string;
  readonly hsnSac: string | null;
  readonly quantity: number;
  readonly unit: string;
  /** Value of the line before its share of the discount. */
  readonly valuePaise: number;
  readonly discountPaise: number;
  /** Value after the discount: what GST is charged on. */
  readonly taxablePaise: number;
  readonly taxRateBp: number;
  readonly cgstPaise: number;
  readonly sgstPaise: number;
  readonly igstPaise: number;
  readonly totalPaise: number;
}

export interface InvoiceRateSummary {
  readonly taxRateBp: number;
  readonly taxablePaise: number;
  readonly cgstPaise: number;
  readonly sgstPaise: number;
  readonly igstPaise: number;
}

export interface InvoiceTotals {
  readonly valuePaise: number;
  readonly discountPaise: number;
  readonly taxablePaise: number;
  readonly cgstPaise: number;
  readonly sgstPaise: number;
  readonly igstPaise: number;
  readonly taxPaise: number;
  readonly totalPaise: number;
}

export interface TaxInvoiceBody {
  readonly supply: SupplyType;
  readonly lines: readonly InvoiceLine[];
  readonly rates: readonly InvoiceRateSummary[];
  readonly totals: InvoiceTotals;
}

function invoiceLine(input: InvoiceLineInput, supply: SupplyType): InvoiceLine {
  const valuePaise = input.amountPaise + input.contingencyPaise;
  const taxablePaise = valuePaise - input.discountPaise;
  const split = splitGst(input.taxPaise, supply);
  return {
    description: input.description,
    hsnSac: input.hsnSac?.trim() ? input.hsnSac.trim() : null,
    quantity: input.quantity,
    unit: input.unit,
    valuePaise,
    discountPaise: input.discountPaise,
    taxablePaise,
    taxRateBp: input.taxRateBp,
    ...split,
    totalPaise: taxablePaise + input.taxPaise,
  };
}

const add = (lines: readonly InvoiceLine[], pick: (line: InvoiceLine) => number) =>
  lines.reduce((sum, line) => sum + pick(line), 0);

/** One row per GST rate, lowest first: the summary an accountant files from. */
function rateSummary(lines: readonly InvoiceLine[]): InvoiceRateSummary[] {
  const rates = [...new Set(lines.map((line) => line.taxRateBp))].sort((a, b) => a - b);
  return rates.map((taxRateBp) => {
    const at = lines.filter((line) => line.taxRateBp === taxRateBp);
    return {
      taxRateBp,
      taxablePaise: add(at, (line) => line.taxablePaise),
      cgstPaise: add(at, (line) => line.cgstPaise),
      sgstPaise: add(at, (line) => line.sgstPaise),
      igstPaise: add(at, (line) => line.igstPaise),
    };
  });
}

export function buildTaxInvoice(
  inputs: readonly InvoiceLineInput[],
  supply: SupplyType,
): TaxInvoiceBody {
  const lines = inputs.map((input) => invoiceLine(input, supply));
  const cgstPaise = add(lines, (line) => line.cgstPaise);
  const sgstPaise = add(lines, (line) => line.sgstPaise);
  const igstPaise = add(lines, (line) => line.igstPaise);
  return {
    supply,
    lines,
    rates: rateSummary(lines),
    totals: {
      valuePaise: add(lines, (line) => line.valuePaise),
      discountPaise: add(lines, (line) => line.discountPaise),
      taxablePaise: add(lines, (line) => line.taxablePaise),
      cgstPaise,
      sgstPaise,
      igstPaise,
      taxPaise: cgstPaise + sgstPaise + igstPaise,
      totalPaise: add(lines, (line) => line.totalPaise),
    },
  };
}

/**
 * Invoice total against the payment schedule. The ledger books revenue and GST from the
 * milestones, so a gap is shown to finance, never posted. Positive: the invoice is higher.
 */
export function scheduleDifference(invoiceTotalPaise: number, scheduleTotalPaise: number): number {
  return invoiceTotalPaise - scheduleTotalPaise;
}

export const INVOICE_SERIES = 'OH/INV';

/** The prefix every number in one financial year shares: "OH/INV/2026-27/". */
export const invoicePrefix = (invoiceDate: string) =>
  `${INVOICE_SERIES}/${financialYear(invoiceDate)}/`;

/**
 * The number after the year's last one: gap-free, restarting at 0001 each April.
 * `last` is the highest number issued so far in that year (cancelled ones included).
 */
export function nextInvoiceNumberAfter(invoiceDate: string, last: string | null): string {
  const prefix = invoicePrefix(invoiceDate);
  const previous = last?.startsWith(prefix) ? Number(last.slice(prefix.length)) : 0;
  const next = Number.isInteger(previous) ? previous + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
