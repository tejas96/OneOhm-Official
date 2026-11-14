import { describe, expect, it } from 'vitest';
import { dayFrom, paiseFrom } from './paid-parse';

describe('paiseFrom', () => {
  it('reads rupees with commas and a sign', () => {
    expect(paiseFrom('45000')).toBe(4_500_000);
    expect(paiseFrom('₹ 1,200.50')).toBe(120_050);
    expect(paiseFrom('Rs. 5000')).toBe(500_000);
  });
  it('refuses nothing, zero, negatives and words', () => {
    for (const bad of [null, '', '0', '-5', 'abc', '99999999999'])
      expect(paiseFrom(bad), String(bad)).toBeNull();
  });
});

describe('dayFrom', () => {
  const now = new Date('2026-11-05T10:00:00Z');
  it('reads a picked day and milliseconds', () => {
    expect(dayFrom('2026-11-03', now)).toBe('2026-11-03');
    expect(dayFrom(String(Date.UTC(2026, 10, 2)), now)).toBe('2026-11-02');
  });
  it('takes a day up to 14 hours ahead of UTC as today (India), but not two days on', () => {
    const early = new Date('2026-11-05T20:00:00Z');
    expect(dayFrom('2026-11-06', early)).toBe('2026-11-06');
    expect(dayFrom('2026-11-07', early)).toBeNull();
  });
  it('refuses a future day and rubbish', () => {
    expect(dayFrom('2026-12-01', now)).toBeNull();
    expect(dayFrom('yesterday', now)).toBeNull();
    expect(dayFrom(null, now)).toBeNull();
  });
});
