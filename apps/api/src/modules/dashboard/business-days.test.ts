import { describe, expect, it } from 'vitest';
import { businessDate, daysSince } from './business-days';

describe('days late on India dates', () => {
  // 20:00 UTC on 3 Nov is 01:30 on 4 Nov in India.
  const lateEvening = new Date('2026-11-03T20:00:00.000Z');

  it('reads a moment as its India date, not its UTC date', () => {
    expect(businessDate(lateEvening, 'Asia/Kolkata')).toBe('2026-11-04');
  });

  it('counts whole India days since a moment', () => {
    expect(daysSince(lateEvening, '2026-11-04', 'Asia/Kolkata')).toBe(0);
    expect(daysSince(lateEvening, '2026-11-06', 'Asia/Kolkata')).toBe(2);
    expect(daysSince(null, '2026-11-06', 'Asia/Kolkata')).toBe(0);
  });
});
