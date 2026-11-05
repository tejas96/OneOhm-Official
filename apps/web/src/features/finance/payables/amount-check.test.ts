import { describe, expect, it } from 'vitest';
import { amountIsOk, checkAmount } from './amount-check';
import { checkText, utrLooksOff } from './text-check';

const LEFT = 9_221_00;

describe('checkAmount', () => {
  it('accepts anything from ₹1 up to what is left', () => {
    for (const amount of [100, 5_000_00, LEFT])
      expect(amountIsOk(checkAmount(amount, LEFT))).toBe(true);
  });

  it('asks for an amount instead of treating empty as ₹0', () => {
    const check = checkAmount(null, LEFT);
    expect(check.status).toBe('empty');
    expect(amountIsOk(check)).toBe(false);
  });

  it('says how much too much, and blocks', () => {
    const check = checkAmount(9_222_00, LEFT);
    expect(check).toMatchObject({ status: 'over', overBy: 100 });
    expect(check.message).toContain('more than what is left');
    expect(checkAmount(99_999_00, LEFT)).toMatchObject({
      status: 'over',
      overBy: 99_999_00 - LEFT,
    });
  });

  it('blocks zero and anything below ₹1', () => {
    expect(checkAmount(0, LEFT).status).toBe('problem');
    expect(checkAmount(99, LEFT).status).toBe('problem');
  });

  it('blocks when nothing is left', () => {
    expect(checkAmount(100, 0).status).toBe('problem');
  });

  it('blocks a fraction of a paise', () => {
    expect(amountIsOk(checkAmount(150.5, LEFT))).toBe(false);
  });
});

describe('checkText', () => {
  it('leaves an empty note alone and flags too short or too long', () => {
    expect(checkText('', 2, 500).problem).toBeNull();
    expect(checkText('  a ', 2, 500).problem).toBe('short');
    expect(checkText('ab', 2, 500).problem).toBeNull();
    expect(checkText('x'.repeat(501), 2, 500).problem).toBe('long');
  });

  it('shows a counter near the limit only', () => {
    expect(checkText('x'.repeat(100), 2, 500).showCounter).toBe(false);
    expect(checkText('x'.repeat(400), 2, 500).showCounter).toBe(true);
  });
});

describe('utrLooksOff', () => {
  it('accepts UPI, IMPS and NEFT references and an empty box', () => {
    for (const ok of ['', '412345678901', 'SBIN524123456789', ' HDFCR52024110512345 '])
      expect(utrLooksOff(ok)).toBe(false);
  });
  it('hints at spaces, dashes and short references', () => {
    for (const odd of ['1234', '4123 4567 8901', 'ref-123456789012'])
      expect(utrLooksOff(odd)).toBe(true);
  });
});
