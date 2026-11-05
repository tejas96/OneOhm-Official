import { formatInr } from '@oneohm/shared';

/**
 * The price, received and balance a receipt shows. The price is the quotation total less the self-survey discount
 * already given (taken off a payment or paid out by hand), so a customer who paid every instalment owes ₹0.
 */
export function receiptTotals(totalPaise: number, discountPaise: number, receivedPaise: number) {
  const price = totalPaise - discountPaise;
  return {
    price: formatInr(price),
    received: formatInr(receivedPaise),
    balance: formatInr(Math.max(0, price - receivedPaise)),
  };
}
