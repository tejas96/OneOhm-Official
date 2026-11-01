/**
 * Vendor invoice matching (PRD 3.10). The vendor's own invoice total is checked against
 * what the purchase order says the received goods cost (rates and GST from the order).
 * A rupee either way is rounding on the vendor's side and still matches.
 */
export const INVOICE_MATCH_TOLERANCE_PAISE = 100;

export const INVOICE_MATCH_STATUSES = ['not_entered', 'matches', 'higher', 'lower'] as const;
export type InvoiceMatchStatus = (typeof INVOICE_MATCH_STATUSES)[number];

export interface InvoiceMatch {
  readonly status: InvoiceMatchStatus;
  /** Invoice less expected: above zero when the vendor asks for more than the order. */
  readonly differencePaise: number;
}

export function matchVendorInvoice(input: {
  readonly expectedPaise: number;
  readonly invoicePaise: number | null;
}): InvoiceMatch {
  if (input.invoicePaise === null) return { status: 'not_entered', differencePaise: 0 };
  const differencePaise = input.invoicePaise - input.expectedPaise;
  if (Math.abs(differencePaise) <= INVOICE_MATCH_TOLERANCE_PAISE) {
    return { status: 'matches', differencePaise };
  }
  return { status: differencePaise > 0 ? 'higher' : 'lower', differencePaise };
}

/** A mismatch the approver should look at before approving the bill. */
export const invoiceNeedsLook = (match: InvoiceMatch) =>
  match.status === 'higher' || match.status === 'lower';
