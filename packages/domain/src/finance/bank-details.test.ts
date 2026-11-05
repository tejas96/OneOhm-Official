import { describe, expect, it } from 'vitest';
import {
  accountNumberProblem,
  bankProblems,
  cleanAccountNumber,
  cleanIfsc,
  ifscProblem,
} from './bank-details';
import { noPanMinimumBp, panFromGstin, vendorPan, vendorTdsShortfall } from './vendor-tds';

describe('IFSC', () => {
  it('cleans spaces and case', () => expect(cleanIfsc(' sbin 0001234 ')).toBe('SBIN0001234'));
  it('accepts a good code', () => expect(ifscProblem('sbin0001234')).toBeNull());
  it('does not judge blank', () => expect(ifscProblem('')).toBeNull());
  it('wants 11 characters', () => expect(ifscProblem('SBIN000123')).toBe('ifsc_length'));
  it('wants a 0 as 5th', () => expect(ifscProblem('SBIN1001234')).toBe('ifsc_zero'));
  it('refuses odd characters', () => expect(ifscProblem('SBIN0001-34')).toBe('ifsc_format'));
});

describe('account number', () => {
  it('drops spaces', () => expect(cleanAccountNumber('1234 5678 9012')).toBe('123456789012'));
  it('takes 9 to 18 digits', () => {
    expect(accountNumberProblem('123456789')).toBeNull();
    expect(accountNumberProblem('123456789012345678')).toBeNull();
  });
  it('refuses 8 digits and 19 digits', () => {
    expect(accountNumberProblem('12345678')).toBe('number_length');
    expect(accountNumberProblem('1234567890123456789')).toBe('number_length');
  });
  it('refuses letters', () => expect(accountNumberProblem('12345678a')).toBe('number_digits'));
});

describe('bankProblems', () => {
  const good = { name: 'Asha Traders', ifsc: 'SBIN0001234', number: '123456789012' };
  it('passes when the number is typed twice', () => {
    expect(bankProblems({ ...good, confirm: '1234 5678 9012' })).toEqual({});
  });
  it('wants the second typing for a new number', () => {
    expect(bankProblems(good).confirm).toBe('confirm_required');
  });
  it('catches a mismatch', () => {
    expect(bankProblems({ ...good, confirm: '123456789013' }).confirm).toBe('confirm_mismatch');
  });
  it('wants the account name with a number', () => {
    expect(bankProblems({ number: '123456789012', confirm: '123456789012' }).name).toBe(
      'name_required',
    );
    expect(bankProblems({ name: 'A', number: '123456789012', confirm: '123456789012' }).name).toBe(
      'name_length',
    );
  });
  it('can leave the saved-name check to the caller', () => {
    const out = bankProblems(
      { number: '123456789012', confirm: '123456789012' },
      { nameRequired: false },
    );
    expect(out.name).toBeUndefined();
  });
  it('asks for nothing when no new number is typed', () => {
    expect(bankProblems({ ifsc: 'SBIN0001234' })).toEqual({});
  });
});

describe('vendor PAN and TDS', () => {
  const gstin = '27AAECO5032B1ZW';
  it('reads the PAN out of a GSTIN', () => expect(panFromGstin(gstin)).toBe('AAECO5032B'));
  it('gives nothing for a bad GSTIN', () => expect(panFromGstin('27AAECO5032B')).toBe(''));
  it('prefers the saved PAN', () => expect(vendorPan('abcde1234f', gstin)).toBe('ABCDE1234F'));
  it('falls back to the GSTIN', () => expect(vendorPan(null, gstin)).toBe('AAECO5032B'));
  it('has none without both', () => expect(vendorPan(null, null)).toBeNull());
  it('sets 5% for goods and 20% for services', () => {
    expect(noPanMinimumBp('goods')).toBe(500);
    expect(noPanMinimumBp('services')).toBe(2000);
  });
  it('finds the shortfall only without a PAN', () => {
    const none = { pan: null, gstin: null };
    expect(vendorTdsShortfall({ tdsBp: 100, kind: 'services', ...none })).toBe(2000);
    expect(vendorTdsShortfall({ tdsBp: 100, kind: 'goods', ...none })).toBe(500);
    expect(vendorTdsShortfall({ tdsBp: 500, kind: 'goods', ...none })).toBeNull();
    expect(vendorTdsShortfall({ tdsBp: 0, kind: 'services', ...none })).toBeNull();
    expect(vendorTdsShortfall({ tdsBp: 100, kind: 'services', pan: null, gstin })).toBeNull();
  });
});
