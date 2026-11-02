import { describe, expect, it } from 'vitest';
import { pickBest, shouldStop } from './best-reading';

describe('pickBest', () => {
  it('picks the smallest accuracy, null last', () => {
    expect(pickBest([{ accuracyM: 40 }, { accuracyM: 12 }, { accuracyM: null }])).toBe(1);
  });
  it('is null for no readings', () => {
    expect(pickBest([])).toBeNull();
  });
  it('keeps a reading with no accuracy when it is the only one', () => {
    expect(pickBest([{ accuracyM: null }])).toBe(0);
  });
});

describe('shouldStop', () => {
  it('stops at 10 m or better', () => {
    expect(shouldStop(9, 2000)).toBe(true);
    expect(shouldStop(10, 0)).toBe(true);
  });
  it('keeps going while worse than 10 m before 15 s', () => {
    expect(shouldStop(11, 14999)).toBe(false);
    expect(shouldStop(null, 100)).toBe(false);
  });
  it('stops at 15 s whatever the accuracy', () => {
    expect(shouldStop(null, 15000)).toBe(true);
    expect(shouldStop(40, 15000)).toBe(true);
  });
});
