/** The last four digits of a masked account such as "•••• 1234". */
export const lastFour = (masked: string): string => masked.replace(/\D/g, '').slice(-4);

export interface PaymentDetails {
  readonly amount: string;
  readonly date: string;
  readonly utr: string;
  readonly payee: string;
  readonly last4: string;
}

export interface PaymentDetailsLabels {
  readonly paid: string;
  readonly date: string;
  readonly utr: string;
  readonly account: string;
}

/** Text to paste into WhatsApp or SMS when a payee asks "where is my money?" (spec U12). */
export function paymentDetailsText(d: PaymentDetails, l: PaymentDetailsLabels): string {
  return [
    `${l.paid}: ${d.amount} → ${d.payee}`,
    `${l.date}: ${d.date}`,
    `${l.utr}: ${d.utr}`,
    `${l.account}: •••• ${d.last4}`,
  ].join('\n');
}
