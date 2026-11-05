import { describe, expect, it } from 'vitest';
import { checkDue } from './action-checks';

const TZ = 'Asia/Kolkata';
// 2026-11-06 is a Friday. IST is UTC+5:30, so 17:30 IST is 12:00 UTC and 09:30 IST is 04:00 UTC.
const at = (day: string, utc: string) => new Date(`${day}T${utc}:00Z`);

describe('checkDue (working time: Mon-Sat 9:30-18:30, Sunday closed)', () => {
  it('a Friday-evening answer is not due on Saturday morning, but is after Saturday closes', () => {
    const answered = at('2026-11-06', '12:00');
    expect(checkDue(answered, at('2026-11-07', '04:00'), TZ)).toBeNull();
    expect(checkDue(answered, at('2026-11-07', '10:00'), TZ)).toBeNull();
    expect(checkDue(answered, at('2026-11-07', '13:00'), TZ)).toBe('owner');
  });

  it('Sunday adds nothing: the manager is told only after 2 working days', () => {
    const answered = at('2026-11-06', '12:00');
    expect(checkDue(answered, at('2026-11-09', '04:00'), TZ)).toBe('owner');
    expect(checkDue(answered, at('2026-11-09', '11:00'), TZ)).toBe('owner');
    expect(checkDue(answered, at('2026-11-09', '12:00'), TZ)).toBe('manager');
  });

  it('a Saturday-evening answer waits for Monday', () => {
    const answered = at('2026-11-07', '12:00');
    expect(checkDue(answered, at('2026-11-09', '04:00'), TZ)).toBeNull();
    expect(checkDue(answered, at('2026-11-09', '13:00'), TZ)).toBe('owner');
  });

  it('a morning answer is due by the same evening, and an old one is let go', () => {
    const answered = at('2026-11-05', '04:00');
    expect(checkDue(answered, at('2026-11-05', '13:00'), TZ)).toBe('owner');
    expect(checkDue(answered, at('2026-11-20', '13:00'), TZ)).toBeNull();
  });
});
