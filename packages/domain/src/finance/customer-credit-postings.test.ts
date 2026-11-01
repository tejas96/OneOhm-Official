import { describe, expect, it } from 'vitest';
import { customerCreditPosting, refundPosting } from './customer-credit-postings';
import { ACCOUNT } from './ledger-accounts';
import { isBalanced, paymentPosting } from './ledger-postings';

describe('customer credit and refunds', () => {
  it('holds an online overpayment as customer credit', () => {
    const lines = customerCreditPosting({ method: 'razorpay', amountPaise: 250_000 });
    expect(isBalanced(lines)).toBe(true);
    expect(lines).toEqual([
      { account: ACCOUNT.gateway, debitPaise: 250_000, creditPaise: 0 },
      { account: ACCOUNT.customerCredit, debitPaise: 0, creditPaise: 250_000 },
    ]);
  });

  it('applies credit to a milestone without new money arriving', () => {
    const due = paymentPosting({
      payer: 'customer',
      method: 'razorpay',
      amountPaise: 100_000,
      milestoneDue: true,
      fromCredit: true,
    });
    expect(due[0]?.account).toBe(ACCOUNT.customerCredit);
    expect(due[1]?.account).toBe(ACCOUNT.customerReceivables);
    const early = paymentPosting({
      payer: 'customer',
      method: 'razorpay',
      amountPaise: 100_000,
      milestoneDue: false,
      fromCredit: true,
    });
    expect(early[1]?.account).toBe(ACCOUNT.advancesReceived);
  });

  it('refunds credit out of the bank, cash or the gateway', () => {
    const bank = refundPosting({
      method: 'bank_transfer',
      amountPaise: 250_000,
      source: { from: 'credit' },
    });
    expect(isBalanced(bank)).toBe(true);
    expect(bank.map((line) => line.account)).toEqual([ACCOUNT.customerCredit, ACCOUNT.bank]);
    const online = refundPosting({
      method: 'razorpay',
      amountPaise: 1,
      source: { from: 'credit' },
    });
    expect(online[1]?.account).toBe(ACCOUNT.gateway);
  });

  it('refunds milestone money from where the payment went', () => {
    const advance = refundPosting({
      method: 'cash',
      amountPaise: 50_000,
      source: { from: 'milestone', payer: 'customer', milestoneDue: false },
    });
    expect(advance.map((line) => line.account)).toEqual([ACCOUNT.advancesReceived, ACCOUNT.cash]);
    const due = refundPosting({
      method: 'upi',
      amountPaise: 50_000,
      source: { from: 'milestone', payer: 'customer', milestoneDue: true },
    });
    expect(due[0]?.account).toBe(ACCOUNT.customerReceivables);
    const bankShare = refundPosting({
      method: 'bank_transfer',
      amountPaise: 50_000,
      source: { from: 'milestone', payer: 'bank', milestoneDue: true },
    });
    expect(bankShare[0]?.account).toBe(ACCOUNT.bankLoanReceivables);
  });
});
