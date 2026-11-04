import { describe, expect, it } from 'vitest';
import { inLanguage } from '../whatsapp/assistant/language';
import { PAY_PAGE_WORDS } from './due-pay-words';
import { partialPayment, UPI_LIMIT_PAISE } from './gateway';

describe('UPI takes at most ₹1,00,000 per payment (live QA round 2)', () => {
  it('lets a link above ₹1 lakh be paid in parts, the first part at least ₹1 lakh', () => {
    expect(UPI_LIMIT_PAISE).toBe(10_000_000);
    expect(partialPayment(11_958_000)).toEqual({
      accept_partial: true,
      first_min_partial_amount: 10_000_000,
    });
    expect(partialPayment(10_000_001)).toEqual({
      accept_partial: true,
      first_min_partial_amount: 10_000_000,
    });
  });

  it('keeps a link of ₹1 lakh or less to one payment', () => {
    expect(partialPayment(10_000_000)).toEqual({ accept_partial: false });
    expect(partialPayment(4_000_000)).toEqual({ accept_partial: false });
  });

  it('says on the pay page how to pay a large amount by UPI, in each language', async () => {
    expect(PAY_PAGE_WORDS.upiParts('₹1,00,000')).toBe(
      'UPI takes up to ₹1,00,000 at a time: pay ₹1,00,000 now, then open this same link again for the rest.',
    );
    for (const language of ['mr', 'hi'] as const)
      await inLanguage(language, async () =>
        expect(PAY_PAGE_WORDS.upiParts('₹1,00,000')).toContain('₹1,00,000'),
      );
  });
});
