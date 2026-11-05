import { describe, expect, it } from 'vitest';
import {
  isLowBalanceFailure,
  isValidAccountNumber,
  isValidIfsc,
  maskAccount,
  payoutFailed,
  payoutFeePosting,
  payoutOpen,
  payoutSucceeded,
  transferMode,
} from './bank-payouts';
import { ACCOUNT } from './ledger-accounts';
import { isBalanced, reversalPosting } from './ledger-postings';

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

  it('splits the fee into a bank charge and GST input credit, bank pays the whole fee', () => {
    const lines = payoutFeePosting(236, 36);
    expect(lines).toEqual([
      { account: ACCOUNT.gatewayFees, debitPaise: 200, creditPaise: 0 },
      { account: ACCOUNT.gstInput, debitPaise: 36, creditPaise: 0 },
      { account: ACCOUNT.bank, debitPaise: 0, creditPaise: 236 },
    ]);
    expect(isBalanced(lines)).toBe(true);
  });

  it('nets to zero on every account once the refund mirror is added', () => {
    const lines = payoutFeePosting(236, 36);
    const net = new Map<string, number>();
    for (const line of [...lines, ...reversalPosting(lines)])
      net.set(line.account, (net.get(line.account) ?? 0) + line.debitPaise - line.creditPaise);
    expect([...net.values()].every((value) => value === 0)).toBe(true);
    expect(isBalanced(reversalPosting(lines))).toBe(true);
  });

  it('never lets the GST be more than the fee, or negative', () => {
    expect(payoutFeePosting(100, 500).some((line) => line.account === ACCOUNT.gatewayFees)).toBe(
      false,
    );
    expect(payoutFeePosting(100, -5)).toHaveLength(2);
  });
});

describe('low balance failures', () => {
  it('knows our own code and the reasons RazorpayX gives', () => {
    expect(isLowBalanceFailure('low_balance')).toBe(true);
    expect(isLowBalanceFailure('insufficient_balance')).toBe(true);
    expect(isLowBalanceFailure('INSUFFICIENT_FUNDS')).toBe(true);
    expect(isLowBalanceFailure('account_closed')).toBe(false);
    expect(isLowBalanceFailure('rejected')).toBe(false);
    expect(isLowBalanceFailure(null)).toBe(false);
  });
});
