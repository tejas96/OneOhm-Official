import { describe, expect, it } from 'vitest';
import { staffHours } from './staff-hours';

describe('staff hours', () => {
  const week = {
    weeklyOff: [0],
    dayStart: '09:30',
    dayEnd: '18:30',
    lunchStart: '13:00',
    lunchEnd: '14:00',
  };

  it('says the usual week in one short line each', () => {
    expect(staffHours(week)).toEqual({
      days: 'Mon–Sat',
      hours: '9:30 am–6:30 pm',
      lunch: '1:00–2:00 pm',
    });
  });

  it('has no lunch when none is set, and lists days that do not run together', () => {
    const odd = staffHours({ ...week, weeklyOff: [0, 2, 4, 6], lunchStart: null, lunchEnd: null });
    expect(odd.lunch).toBeNull();
    expect(odd.days).toBe('Mon, Wed, Fri');
  });

  it('says so when every day is off', () => {
    expect(staffHours({ ...week, weeklyOff: [0, 1, 2, 3, 4, 5, 6] }).days).toBe(
      'No working days set',
    );
  });
});
