import { describe, expect, it } from 'vitest';
import {
  amountProblem,
  followUpProblem,
  happenedOnProblem,
  isIndianMobile,
  nowTimeIn,
  optionalNotNegativeProblem,
  parseNumber,
} from './checks';

describe('form checks', () => {
  it('accepts Indian mobiles only', () => {
    expect(isIndianMobile('98765 43210')).toBe(true);
    expect(isIndianMobile('+919876543210')).toBe(true);
    expect(isIndianMobile('5876543210')).toBe(false);
    expect(isIndianMobile('98765')).toBe(false);
  });

  it('reads the time in India', () => {
    expect(nowTimeIn('Asia/Kolkata', new Date('2026-11-01T18:45:00Z'))).toBe('00:15');
  });

  it('parses numbers and rejects junk', () => {
    expect(parseNumber('1,200.5')).toBe(1200.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('date and amount checks', () => {
  it('keeps follow-ups in the future', () => {
    expect(followUpProblem('2026-10-31', null, '2026-11-01', '10:00')).toEqual({
      field: 'date',
      key: 'dateNotPast',
    });
    expect(followUpProblem('2026-11-01', '09:00', '2026-11-01', '10:00')).toEqual({
      field: 'time',
      key: 'timeNotPast',
    });
    expect(followUpProblem('2026-11-01', '11:00', '2026-11-01', '10:00')).toBeNull();
    expect(followUpProblem('2026-11-02', '09:00', '2026-11-01', '10:00')).toBeNull();
  });

  it('checks amounts and past dates', () => {
    expect(amountProblem('0')).toBe('positiveAmount');
    expect(amountProblem('12.5')).toBeNull();
    expect(optionalNotNegativeProblem('')).toBeNull();
    expect(optionalNotNegativeProblem('-1')).toBe('notNegative');
    expect(happenedOnProblem('2026-11-02', '2026-11-01')).toBe('dateNotFuture');
    expect(happenedOnProblem('', '2026-11-01')).toBe('required');
  });
});
