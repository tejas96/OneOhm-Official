import { describe, expect, it } from 'vitest';
import {
  maskAccount,
  type PayoutDetails,
  payoutDetailsComplete,
  payoutDetailsProblems,
} from './payout-details';

const empty: PayoutDetails = {
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  upiId: null,
  pan: null,
};

describe('payoutDetailsComplete', () => {
  it('complete with PAN + UPI', () => {
    expect(payoutDetailsComplete({ ...empty, pan: 'ABCDE1234F', upiId: 'a@upi' })).toBe(true);
  });

  it('complete with PAN + all bank fields', () => {
    expect(
      payoutDetailsComplete({
        ...empty,
        pan: 'ABCDE1234F',
        bankAccountName: 'A B',
        bankAccountNumber: '123456781234',
        bankIfsc: 'SBIN0001234',
      }),
    ).toBe(true);
  });

  it('not complete: PAN + account number but no IFSC', () => {
    expect(
      payoutDetailsComplete({
        ...empty,
        pan: 'ABCDE1234F',
        bankAccountName: 'A B',
        bankAccountNumber: '123456781234',
      }),
    ).toBe(false);
  });

  it('not complete: no PAN', () => {
    expect(payoutDetailsComplete({ ...empty, upiId: 'a@upi' })).toBe(false);
  });

  it('not complete: null details', () => {
    expect(payoutDetailsComplete(null)).toBe(false);
  });
});

describe('maskAccount', () => {
  it('keeps only the last 4 characters', () => {
    expect(maskAccount('123456781234')).toBe('••••1234');
  });

  it('returns null for null', () => {
    expect(maskAccount(null)).toBeNull();
  });

  it('masks short values without losing them', () => {
    expect(maskAccount('12')).toBe('••••12');
  });
});

describe('payoutDetailsProblems', () => {
  it('abcde1234f is fixed to ABCDE1234F and passes', () => {
    expect(payoutDetailsProblems({ ...empty, pan: ' abcde1234f ' })).toEqual({});
  });

  it("IFSC 'SBIN1234567' fails because its fifth character must be 0", () => {
    expect(payoutDetailsProblems({ ...empty, bankIfsc: 'SBIN1234567' })).toHaveProperty('bankIfsc');
  });

  it('flags a bad PAN, UPI and account number', () => {
    const problems = payoutDetailsProblems({
      ...empty,
      pan: 'ABC',
      upiId: 'nope',
      bankAccountNumber: '12345',
    });
    expect(Object.keys(problems).sort()).toEqual(['bankAccountNumber', 'pan', 'upiId']);
  });

  it('ignores empty fields', () => {
    expect(payoutDetailsProblems(empty)).toEqual({});
  });
});
