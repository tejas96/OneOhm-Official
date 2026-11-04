import { describe, expect, it } from 'vitest';
import { codeDigits, toIndianMobile } from './mobile-number';

describe('toIndianMobile', () => {
  it('accepts ten digits with or without +91, spaces and dashes', () => {
    expect(toIndianMobile('98765 43210')).toBe('+919876543210');
    expect(toIndianMobile('+91 98765-43210')).toBe('+919876543210');
    expect(toIndianMobile(' 9876543210 ')).toBe('+919876543210');
  });

  it('turns down anything that is not an Indian mobile number', () => {
    expect(toIndianMobile('')).toBe(null);
    expect(toIndianMobile('12345 67890')).toBe(null);
    expect(toIndianMobile('98765 4321')).toBe(null);
    expect(toIndianMobile('name@oneohm.in')).toBe(null);
  });
});

describe('codeDigits', () => {
  it('keeps at most six digits, whatever is pasted', () => {
    expect(codeDigits('12 34 56')).toBe('123456');
    expect(codeDigits('Your code is 4821930')).toBe('482193');
    expect(codeDigits('abc')).toBe('');
  });
});
