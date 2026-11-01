import type { customerInvoiceLines, customerInvoices } from '@oneohm/database';
import { amountInWords, formatInr } from '@oneohm/shared';
import type { InvoiceParties } from './invoice-parties';

type Invoice = typeof customerInvoices.$inferSelect;
type Line = typeof customerInvoiceLines.$inferSelect;

const longDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});
const dateOf = (day: string) => longDate.format(new Date(`${day}T12:00:00+05:30`));

/** Table figures in rupees with two decimals; the column heads say ₹. */
const figures = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const amount = (paise: number) => figures.format(paise / 100);
const rupees = (paise: number) => `₹${amount(paise)}`;

const percent = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;

const quantity = (value: number, unit: string) =>
  `${Number.isInteger(value) ? value : value.toFixed(2).replace(/\.?0+$/, '')} ${unit}`;

function lineView(line: Line, index: number) {
  return {
    index: index + 1,
    description: line.description,
    code: line.hsnSac ?? '',
    quantity: quantity(line.quantity, line.unit),
    taxable: amount(line.taxablePaise),
    rate: percent(line.taxRateBp),
    half: percent(line.taxRateBp / 2),
    cgst: amount(line.cgstPaise),
    sgst: amount(line.sgstPaise),
    igst: amount(line.igstPaise),
    total: amount(line.totalPaise),
  };
}

/** One row per GST rate: taxable value and each tax, as GSTR-1 reports them. */
function rateRows(lines: readonly Line[]) {
  const rates = [...new Set(lines.map((line) => line.taxRateBp))].sort((a, b) => a - b);
  return rates.map((rate) => {
    const at = lines.filter((line) => line.taxRateBp === rate);
    const sum = (pick: (line: Line) => number) => at.reduce((total, line) => total + pick(line), 0);
    return {
      rate: percent(rate),
      taxable: amount(sum((line) => line.taxablePaise)),
      cgst: amount(sum((line) => line.cgstPaise)),
      sgst: amount(sum((line) => line.sgstPaise)),
      igst: amount(sum((line) => line.igstPaise)),
      tax: amount(sum((line) => line.cgstPaise + line.sgstPaise + line.igstPaise)),
    };
  });
}

function notes(invoice: Invoice, parties: InvoiceParties, links: InvoiceLinks) {
  return {
    cancelled:
      invoice.status === 'cancelled' && invoice.cancelledAt
        ? `Cancelled on ${longDate.format(invoice.cancelledAt)}${invoice.cancelReason ? `: ${invoice.cancelReason}` : ''}.${links.replacedBy ? ` Replaced by ${links.replacedBy}.` : ''}`
        : null,
    replaces: links.replaces ? `Issued in place of cancelled invoice ${links.replaces}.` : null,
    subsidyNote:
      parties.subsidyPaise > 0
        ? `For information only: the expected government subsidy of ${formatInr(parties.subsidyPaise)} is paid by the government straight to the customer; it is not deducted here.`
        : null,
  };
}

export interface InvoiceLinks {
  readonly replaces: string | null;
  readonly replacedBy: string | null;
}

/** Every string the invoice template prints, formatted once here. */
export function invoiceView(
  invoice: Invoice,
  lines: readonly Line[],
  projectCode: string,
  links: InvoiceLinks,
  images: { readonly logo: string; readonly stamp: string },
) {
  const parties = invoice.parties as InvoiceParties;
  const intra = invoice.supply === 'intra_state';
  const { quotation } = parties;
  return {
    number: invoice.number,
    date: dateOf(invoice.invoiceDate),
    project: projectCode,
    quotation:
      quotation.revision > 1 ? `${quotation.number} · R${quotation.revision}` : quotation.number,
    seller: parties.seller,
    buyer: { ...parties.buyer, gstin: invoice.customerGstin },
    placeOfSupply: `${invoice.placeOfSupplyCode}-${invoice.placeOfSupplyState}`,
    supplyLabel: intra ? 'Within the state: CGST + SGST' : 'To another state: IGST',
    intra,
    showCodes: lines.some((line) => line.hsnSac),
    lines: lines.map(lineView),
    rates: rateRows(lines),
    totals: {
      value: rupees(invoice.valuePaise),
      discount: invoice.discountPaise > 0 ? rupees(invoice.discountPaise) : null,
      taxable: rupees(invoice.taxablePaise),
      cgst: rupees(invoice.cgstPaise),
      sgst: rupees(invoice.sgstPaise),
      igst: rupees(invoice.igstPaise),
      tax: rupees(invoice.cgstPaise + invoice.sgstPaise + invoice.igstPaise),
      total: rupees(invoice.totalPaise),
    },
    amountInWords: amountInWords(invoice.totalPaise),
    ...notes(invoice, parties, links),
    ...images,
  };
}
