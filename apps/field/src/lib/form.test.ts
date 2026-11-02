import { describe, expect, it } from 'vitest';
import { businessClock } from './dates';
import { isIndianMobile, passes, withoutKeys } from './form';

describe('isIndianMobile', () => {
  it('takes 10 digits starting 6-9, with spaces or +91', () => {
    expect(isIndianMobile('98765 43210')).toBe(true);
    expect(isIndianMobile('+91 98765-43210')).toBe(true);
    expect(isIndianMobile('9876543210')).toBe(true);
  });
  it('refuses short numbers and ones starting 0-5', () => {
    expect(isIndianMobile('987654321')).toBe(false);
    expect(isIndianMobile('5876543210')).toBe(false);
    expect(isIndianMobile('')).toBe(false);
  });
});

describe('withoutKeys', () => {
  it('drops the named fields and keeps the same object when nothing changes', () => {
    const checks = { note: 'Write what happened.', city: 'Enter the town or city.' };
    expect(withoutKeys(checks, 'note')).toEqual({ city: 'Enter the town or city.' });
    expect(withoutKeys(checks, 'phone')).toBe(checks);
    expect(passes(withoutKeys(checks, 'note', 'city'))).toBe(true);
  });
});

describe('businessClock', () => {
  it('reads the time in India', () => {
    expect(businessClock(new Date('2026-11-01T10:05:00Z'))).toBe('15:35');
    expect(businessClock(new Date('2026-11-01T18:45:00Z'))).toBe('00:15');
  });
});
