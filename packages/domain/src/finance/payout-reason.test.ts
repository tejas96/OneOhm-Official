import { describe, expect, it } from 'vitest';
import { payoutProblemReason } from './payout-reason';

describe('the reason shown when a payout fails or comes back', () => {
  it('never shows a leftover "processed" message on money that came back', () => {
    // As RazorpayX test mode sent it on 5 Nov 2026.
    const result = payoutProblemReason(
      {
        details: {
          reason: 'payout_processed',
          description:
            'Payout is processed and the money has been credited into the beneficiary account.',
        },
        failureReason: 'Payout failed. Contact support for help.',
      },
      'reversed',
    );
    expect(result.text).toBe(
      'The bank sent the money back. Check the bank details with the payee, then pay again.',
    );
    expect(result.code).toBeNull();
  });

  it("keeps the bank's own reason when it is useful", () => {
    const result = payoutProblemReason(
      {
        details: { reason: 'beneficiary_bank_offline', description: 'Beneficiary bank is offline' },
      },
      'failed',
    );
    expect(result).toEqual({
      text: 'Beneficiary bank is offline',
      code: 'beneficiary_bank_offline',
    });
  });

  it('never uses a success message as the reason, whichever field holds it', () => {
    const text =
      'Payout is processed and the money has been credited into the beneficiary account.';
    expect(
      payoutProblemReason({ details: { description: text }, failureReason: text }, 'failed').text,
    ).toBe('The bank did not accept it. Check the bank details with the payee, then pay again.');
  });

  it('falls back to plain words when nothing useful was sent', () => {
    expect(payoutProblemReason({}, 'failed').text).toBe(
      'The bank did not accept it. Check the bank details with the payee, then pay again.',
    );
  });
});
