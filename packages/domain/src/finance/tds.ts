/**
 * TDS, tax deducted at source (PRD 3.11). On a bill, OneOhm holds back a share and pays
 * it to the government instead of the vendor or crew. A business customer may do the
 * same to OneOhm: it pays less, and the TDS is a credit OneOhm claims against its own tax.
 * Rates are in basis points (1% = 100).
 */

/** The highest rate a bill may carry: 20%, the rate for a payee without a PAN. */
export const TDS_MAX_BP = 2000;

/** The Income-tax Act rounds TDS to the nearest rupee. */
const toRupee = (paise: number) => Math.round(paise / 100) * 100;

/**
 * TDS on a bill. Worked out on the value before GST when the bill's GST is known (bills
 * raised from a goods receipt); otherwise on the whole amount. Never more than the bill.
 */
export function billTds(input: {
  readonly amountPaise: number;
  readonly gstPaise: number;
  readonly tdsBp: number;
}): number {
  const amount = Math.max(0, input.amountPaise);
  const bp = Math.min(Math.max(0, Math.round(input.tdsBp)), TDS_MAX_BP);
  const gst = Math.min(Math.max(0, input.gstPaise), amount);
  return Math.min(amount, toRupee(((amount - gst) * bp) / 10_000));
}

/** What still goes to the vendor or crew: the bill less TDS held and advances set off. */
export function billToPay(bill: {
  readonly amountPaise: number;
  readonly tdsPaise: number;
  readonly advanceAdjustedPaise: number;
}): number {
  return Math.max(0, bill.amountPaise - bill.tdsPaise - bill.advanceAdjustedPaise);
}

/**
 * Receipts on which a business customer may have deducted TDS: money that came through
 * a bank. Cash, online links, credit and a lender's disbursement never carry TDS.
 */
export const CUSTOMER_TDS_METHODS = ['bank_transfer', 'upi', 'cheque'] as const;

/** Above a fifth of what is settled, the TDS figure is almost surely a typing mistake. */
const CUSTOMER_TDS_MAX_SHARE = 0.2;

export type CustomerTdsProblem = 'not_by_bank' | 'too_high';

/**
 * Checks TDS a customer says it deducted. `receivedPaise` is the money that arrived;
 * the receipt settles that plus the TDS. Null when it is fine (or there is none).
 */
export function customerTdsProblem(input: {
  readonly method: string;
  readonly payer: 'customer' | 'bank';
  readonly fromCredit: boolean;
  readonly receivedPaise: number;
  readonly tdsPaise: number;
}): CustomerTdsProblem | null {
  if (input.tdsPaise <= 0) return null;
  const byBank = (CUSTOMER_TDS_METHODS as readonly string[]).includes(input.method);
  if (!byBank || input.payer !== 'customer' || input.fromCredit) return 'not_by_bank';
  const settled = input.receivedPaise + input.tdsPaise;
  if (input.tdsPaise > settled * CUSTOMER_TDS_MAX_SHARE) return 'too_high';
  return null;
}

/** The money in a receipt: what it settled less the TDS the customer kept back. */
export function receivedMoney(payment: {
  readonly amountPaise: number;
  readonly tdsPaise: number;
}): number {
  return payment.amountPaise - payment.tdsPaise;
}
