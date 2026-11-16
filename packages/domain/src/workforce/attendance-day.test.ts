import { describe, expect, it } from 'vitest';
import { calendarFrom } from '../calendar/business-calendar';
import {
  autoCloseAt,
  CORRECTION_WINDOW_DAYS,
  correctionDateProblem,
  isLateOnDay,
  mergedDayProblem,
} from './attendance-day';

const TZ = 'Asia/Kolkata';
const calendar = calendarFrom({
  timeZone: TZ,
  weeklyOff: [0],
  dayStart: '09:30',
  dayEnd: '18:30',
  holidays: ['2026-11-11'],
});
const rule = { dayStart: '09:30', graceMinutes: 15 };
// India is UTC+5:30, so 10:30 India is 05:00 UTC.
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

describe('late on a working day only', () => {
  it('is late past the grace on an ordinary day', () => {
    expect(isLateOnDay(at('2026-11-10', '10:30'), '2026-11-10', rule, calendar)).toBe(true);
    expect(isLateOnDay(at('2026-11-10', '09:44'), '2026-11-10', rule, calendar)).toBe(false);
  });

  it('is never late on a weekly off or a holiday', () => {
    // Sunday 8 Nov 2026 is the weekly off; 11 Nov is a company holiday.
    expect(isLateOnDay(at('2026-11-08', '12:00'), '2026-11-08', rule, calendar)).toBe(false);
    expect(isLateOnDay(at('2026-11-11', '12:00'), '2026-11-11', rule, calendar)).toBe(false);
  });
});

describe('which day may be corrected', () => {
  it('refuses the future and days beyond the window', () => {
    expect(correctionDateProblem('2026-11-16', '2026-11-15')).toMatch(/earlier day/);
    expect(correctionDateProblem('2026-11-15', '2026-11-15')).toBeNull();
    expect(correctionDateProblem('2026-10-15', '2026-11-15')).toBeNull(); // 31 days
    expect(correctionDateProblem('2026-10-14', '2026-11-15')).toMatch(
      new RegExp(String(CORRECTION_WINDOW_DAYS)),
    );
  });
});

describe('the day a correction would leave', () => {
  const day = { checkInAt: at('2026-11-10', '09:20'), checkOutAt: null };
  const base = { workDate: '2026-11-10', timeZone: TZ, checkInAt: null, checkOutAt: null };

  it('refuses a check-out alone when there is no day', () => {
    expect(mergedDayProblem({ ...base, day: null, checkOutAt: at('2026-11-10', '18:00') })).toBe(
      'no_day',
    );
  });

  it('accepts a check-out for an open day', () => {
    expect(mergedDayProblem({ ...base, day, checkOutAt: at('2026-11-10', '18:00') })).toBeNull();
  });

  it('refuses a check-out before the recorded check-in', () => {
    expect(mergedDayProblem({ ...base, day, checkOutAt: at('2026-11-10', '09:00') })).toBe(
      'check_out_order',
    );
  });

  it('judges a corrected check-in together with the recorded check-out', () => {
    const closed = { ...day, checkOutAt: at('2026-11-10', '18:00') };
    expect(mergedDayProblem({ ...base, day: closed, checkInAt: at('2026-11-10', '19:00') })).toBe(
      'check_out_order',
    );
  });

  it('keeps the check-in on the work date and the day within 24 hours', () => {
    expect(
      mergedDayProblem({
        ...base,
        day: null,
        checkInAt: at('2026-11-09', '23:00'),
        checkOutAt: at('2026-11-10', '01:00'),
      }),
    ).toBe('check_in_date');
    expect(
      mergedDayProblem({
        ...base,
        day,
        checkOutAt: at('2026-11-11', '10:00'),
      }),
    ).toBe('too_long');
    // Overnight work is fine inside 24 hours.
    expect(mergedDayProblem({ ...base, day, checkOutAt: at('2026-11-11', '02:00') })).toBeNull();
  });

  it('refuses a correction that changes nothing', () => {
    expect(mergedDayProblem({ ...base, day, checkInAt: day.checkInAt })).toBe('nothing_changes');
  });
});

describe('where a forgotten day ends', () => {
  const base = { workDate: '2026-11-10', timeZone: TZ, checkInAt: at('2026-11-10', '09:20') };

  it('is the check-in when there was no other activity', () => {
    expect(autoCloseAt({ ...base, activity: [] })).toEqual(base.checkInAt);
  });

  it('is the latest site check-in or check-out', () => {
    const last = at('2026-11-10', '17:40');
    expect(autoCloseAt({ ...base, activity: [at('2026-11-10', '11:00'), last, null] })).toEqual(
      last,
    );
  });

  it('never ends later than the end of the work date', () => {
    const late = at('2026-11-11', '03:00');
    expect(autoCloseAt({ ...base, activity: [late] })).toEqual(at('2026-11-11', '00:00'));
  });

  it('ignores activity before the check-in', () => {
    expect(autoCloseAt({ ...base, activity: [at('2026-11-10', '08:00')] })).toEqual(base.checkInAt);
  });
});
