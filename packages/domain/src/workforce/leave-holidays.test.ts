import { describe, expect, it } from 'vitest';
import { leaveHalfDays } from './leave';

describe('leave days and holidays', () => {
  const sundaysOff = [0];
  const qaHoliday = ['2026-11-20'];

  it('does not count a holiday inside the leave', () => {
    // Thu 19 to Sat 21 Nov 2026, Fri 20 is a holiday: Thu and Sat only.
    expect(
      leaveHalfDays({
        from: '2026-11-19',
        to: '2026-11-21',
        halfDay: false,
        weeklyOff: sundaysOff,
        holidays: qaHoliday,
      }),
    ).toBe(4);
  });

  it('counts nothing when the only day is a holiday, even as a half day', () => {
    const one = {
      from: '2026-11-20',
      to: '2026-11-20',
      weeklyOff: sundaysOff,
      holidays: qaHoliday,
    };
    expect(leaveHalfDays({ ...one, halfDay: false })).toBe(0);
    expect(leaveHalfDays({ ...one, halfDay: true })).toBe(0);
  });

  it('skips a holiday that falls on the weekly off only once', () => {
    // Sat 21 to Mon 23 Nov 2026, Sunday 22 is both off and a holiday: Sat and Mon.
    expect(
      leaveHalfDays({
        from: '2026-11-21',
        to: '2026-11-23',
        halfDay: false,
        weeklyOff: sundaysOff,
        holidays: ['2026-11-22'],
      }),
    ).toBe(4);
  });

  it('ignores holidays outside the leave and works with none given', () => {
    const window = { from: '2026-11-16', to: '2026-11-17', halfDay: false, weeklyOff: sundaysOff };
    expect(leaveHalfDays({ ...window, holidays: qaHoliday })).toBe(4);
    expect(leaveHalfDays(window)).toBe(4);
  });
});
