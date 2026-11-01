import { describe, expect, it } from 'vitest';
import { readRunNumber } from './cable-run-check';

describe('readRunNumber', () => {
  it('reads plain numbers, thousands and metres written with the unit', () => {
    expect(readRunNumber('acrossM', '12.5')).toEqual({ value: 12.5, problem: null });
    expect(readRunNumber('acrossM', '1,200')).toEqual({ value: 1200, problem: null });
    expect(readRunNumber('upM', '9 m')).toEqual({ value: 9, problem: null });
    expect(readRunNumber('upM', '6M')).toEqual({ value: 6, problem: null });
    expect(readRunNumber('floor', ' 3 ')).toEqual({ value: 3, problem: null });
  });

  it('takes a blank as the least the field allows', () => {
    expect(readRunNumber('acrossM', '')).toEqual({ value: 0, problem: null });
    expect(readRunNumber('runs', '  ')).toEqual({ value: 1, problem: null });
  });

  it('says why text cannot be used', () => {
    expect(readRunNumber('acrossM', 'twelve').problem).toBe('not_a_number');
    expect(readRunNumber('acrossM', '12 ft').problem).toBe('not_a_number');
    expect(readRunNumber('floor', '2m').problem).toBe('not_a_number');
    expect(readRunNumber('acrossM', '1.2.3').problem).toBe('not_a_number');
    expect(readRunNumber('upM', '-4').problem).toBe('too_small');
    expect(readRunNumber('runs', '0').problem).toBe('too_small');
    expect(readRunNumber('floor', '41').problem).toBe('too_big');
    expect(readRunNumber('acrossM', '2001').problem).toBe('too_big');
    expect(readRunNumber('runs', '2.5').problem).toBe('not_whole');
    expect(readRunNumber('floor', '1.5').problem).toBe('not_whole');
  });

  it('keeps metres to their decimals', () => {
    expect(readRunNumber('acrossM', '.5')).toEqual({ value: 0.5, problem: null });
    expect(readRunNumber('runs', '100')).toEqual({ value: 100, problem: null });
  });
});
