import { describe, expect, it } from 'vitest';
import { consumerNumberProblem, normalizeConsumerNumber } from './consumer-number';

describe('Consumer number', () => {
  it('drops spaces, dashes, dots and slashes and writes letters in capitals', () => {
    expect(normalizeConsumerNumber(' 1900 1234-5678 ')).toBe('190012345678');
    expect(normalizeConsumerNumber('ab/12.34')).toBe('AB1234');
  });

  it('accepts a bill number of 6 to 20 letters or digits', () => {
    expect(consumerNumberProblem('190012345678')).toBeNull();
    expect(consumerNumberProblem('CA00123456')).toBeNull();
  });

  it('refuses numbers that are too short, too long, wordy or have other marks', () => {
    expect(consumerNumberProblem('12345')).not.toBeNull();
    expect(consumerNumberProblem('1'.repeat(21))).not.toBeNull();
    expect(consumerNumberProblem('PENDING')).not.toBeNull();
    expect(consumerNumberProblem('190012345678(TEST)')).not.toBeNull();
  });
});
