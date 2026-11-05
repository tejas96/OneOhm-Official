import { describe, expect, it } from 'vitest';
import { lastFour, paymentDetailsText } from './copy-details';

describe('copy details', () => {
  it('takes the last four digits', () => {
    expect(lastFour('•••• 1234')).toBe('1234');
    expect(lastFour('')).toBe('');
  });
  it('builds text with amount, date, UTR, payee and last 4', () => {
    const text = paymentDetailsText(
      { amount: '₹5,000', date: '5 Nov 2026', utr: 'UTR123', payee: 'Sun Power', last4: '1234' },
      { paid: 'Paid', date: 'Date', utr: 'UTR', account: 'Account' },
    );
    expect(text).toBe(
      'Paid: ₹5,000 → Sun Power\nDate: 5 Nov 2026\nUTR: UTR123\nAccount: •••• 1234',
    );
  });
});
