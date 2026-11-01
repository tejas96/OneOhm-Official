import { describe, expect, it } from 'vitest';
import {
  isValidAccountNumber,
  isValidIfsc,
  maskAccount,
  payoutFailed,
  payoutFeePosting,
  payoutOpen,
  payoutSucceeded,
  transferMode,
} from './bank-payouts';

describe('bank payouts through RazorpayX (PRD 3.11)', () => {
  it('sends up to ₹5 lakh by IMPS and more by NEFT', () => {
    expect(transferMode(5_00_000_00)).toBe('IMPS');
    expect(transferMode(5_00_000_01)).toBe('NEFT');
  });

  it('counts only processed as paid, and the rest as open or failed', () => {
    expect(payoutSucceeded('processed')).toBe(true);
    expect(payoutOpen('processing')).toBe(true);
    expect(payoutFailed('reversed')).toBe(true);
    expect(payoutOpen('reversed')).toBe(false);
  });

  it('checks bank details and shows only the last four digits', () => {
    expect(isValidIfsc('SBIN0001234')).toBe(true);
    expect(isValidIfsc('sbin0001234')).toBe(false);
    expect(isValidAccountNumber('12345678901')).toBe(true);
    expect(isValidAccountNumber('1234')).toBe(false);
    expect(maskAccount('123456789012')).toBe('•••• 9012');
  });

  it('books the payout fee as a bank charge', () => {
    const lines = payoutFeePosting(590);
    expect(lines.reduce((sum, line) => sum + line.debitPaise - line.creditPaise, 0)).toBe(0);
    expect(payoutFeePosting(0)).toEqual([]);
  });
});
