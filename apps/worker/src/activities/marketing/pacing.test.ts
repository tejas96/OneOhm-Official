import { describe, expect, it } from 'vitest';
import { isDue } from './pacing';

const TZ = 'Asia/Kolkata';
// 2026-11-15 09:30 IST = 04:00 UTC.
const at = (hhmmIst: string, day = '2026-11-15') => new Date(`${day}T${hhmmIst}:00+05:30`);

describe('pacing', () => {
  it('runs "every" jobs always', () => {
    expect(isDue('every', at('09:30'), at('09:31'), TZ)).toBe(true);
  });

  it('runs hourly jobs once the last run is 55 minutes old', () => {
    expect(isDue('hourly', null, at('10:00'), TZ)).toBe(true);
    expect(isDue('hourly', at('10:00'), at('10:54'), TZ)).toBe(false);
    expect(isDue('hourly', at('10:00'), at('10:55'), TZ)).toBe(true);
  });

  it('runs daily jobs once per business day after 09:00 business time', () => {
    expect(isDue('daily', null, at('08:59'), TZ)).toBe(false);
    expect(isDue('daily', null, at('09:00'), TZ)).toBe(true);
    expect(isDue('daily', at('09:05'), at('15:00'), TZ)).toBe(false);
    expect(isDue('daily', at('09:05', '2026-11-14'), at('09:15'), TZ)).toBe(true);
  });

  it('counts the business day, not the UTC day', () => {
    // 00:30 IST on the 15th is still the 14th in UTC; a run then belongs to the 15th.
    expect(isDue('daily', at('00:30'), at('09:15'), TZ)).toBe(false);
  });
});
