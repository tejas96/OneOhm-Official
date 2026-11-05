import { describe, expect, it } from 'vitest';
import { receiptTotals } from './receipt-totals';

describe('receipt totals', () => {
  it('shows ₹0 owed once every instalment of a discounted project is paid', () => {
    expect(receiptTotals(18_500_000, 100_000, 18_400_000)).toEqual({
      price: '₹1,84,000',
      received: '₹1,84,000',
      balance: '₹0',
    });
  });
  it('without a discount it is the quotation total', () => {
    expect(receiptTotals(18_500_000, 0, 5_000_000).balance).toBe('₹1,35,000');
  });
});
