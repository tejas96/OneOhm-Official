import { describe, expect, it } from 'vitest';
import {
  calendarOf,
  checkVisitSettings,
  checkWorkingTime,
  type WorkingTimeSettings,
} from './calendar-check';
import { visitsOutsideCalendar } from './visit-conflicts';
import { DEFAULT_VISIT_SETTINGS, type VisitSettings } from './visit-settings';

const WORK: WorkingTimeSettings = {
  weeklyOff: [0],
  dayStart: '09:30',
  dayEnd: '18:30',
  lunchStart: '13:00',
  lunchEnd: '14:00',
};
const V = DEFAULT_VISIT_SETTINGS;
const visits = (change: Partial<VisitSettings>): VisitSettings => ({ ...V, ...change });

describe('the shipped defaults', () => {
  it('pass both checks together', () => {
    expect(checkWorkingTime(WORK, V)).toEqual({});
    expect(checkVisitSettings(V, WORK)).toEqual({});
  });
});

describe('working time on its own', () => {
  it('needs at least one working weekday', () => {
    expect(checkWorkingTime({ ...WORK, weeklyOff: [0, 1, 2, 3, 4, 5, 6] }, V).weeklyOff).toMatch(
      /at least one working day/,
    );
    expect(checkWorkingTime({ ...WORK, weeklyOff: [0, 6] }, V)).toEqual({});
  });
  it('needs real times and closing after opening', () => {
    expect(checkWorkingTime({ ...WORK, dayStart: '9:3' }, V).dayStart).toMatch(/Pick a time/);
    expect(checkWorkingTime({ ...WORK, dayEnd: '09:30' }, V).dayEnd).toMatch(/after opening/);
    expect(checkWorkingTime({ ...WORK, dayEnd: '08:00' }, V).dayEnd).toMatch(/after opening/);
  });
  it('keeps lunch inside the hours and ending after it starts', () => {
    expect(checkWorkingTime({ ...WORK, lunchEnd: '13:00' }, V).lunchEnd).toMatch(/end after/);
    expect(
      checkWorkingTime({ ...WORK, lunchStart: '09:00', lunchEnd: '10:00' }, V).lunchStart,
    ).toMatch(/inside working hours/);
    expect(
      checkWorkingTime({ ...WORK, lunchStart: '18:00', lunchEnd: '19:00' }, V).lunchStart,
    ).toMatch(/inside working hours/);
    expect(checkWorkingTime({ ...WORK, lunchStart: null, lunchEnd: null }, V)).toEqual({});
    expect(checkWorkingTime({ ...WORK, lunchEnd: null }, V).lunchEnd).toMatch(/Pick a time/);
  });
});

describe('working time against the saved visit times', () => {
  it('refuses a closing time that cuts off a visit time, naming it', () => {
    const errors = checkWorkingTime({ ...WORK, dayEnd: '17:00' }, V);
    expect(errors.dayEnd).toMatch(/17:00 visit time/);
    expect(errors.dayEnd).toMatch(/after closing \(17:00\)/);
  });
  it('refuses an opening time after a visit time starts', () => {
    expect(checkWorkingTime({ ...WORK, dayStart: '10:30' }, V).dayStart).toMatch(
      /10:00 visit time/,
    );
  });
  it('refuses lunch that runs into a visit time', () => {
    const errors = checkWorkingTime({ ...WORK, lunchStart: '12:30', lunchEnd: '13:30' }, V);
    expect(errors.lunchStart).toMatch(/11:30 visit time/);
  });
  it('refuses hours that leave a reminder or alert outside them', () => {
    expect(
      checkWorkingTime({ ...WORK, dayEnd: '17:00' }, visits({ slotStarts: ['10:00'] })).dayEnd,
    ).toMatch(/day-before reminder at 17:00/);
    expect(
      checkWorkingTime({ ...WORK, dayStart: '10:00' }, visits({ slotStarts: ['10:00'] })).dayStart,
    ).toMatch(/not-confirmed alert at 09:30/);
  });
});

describe('visit settings', () => {
  it('keeps the numbers in range', () => {
    expect(checkVisitSettings(visits({ visitMinutes: 20 }), WORK).visitMinutes).toBeDefined();
    expect(checkVisitSettings(visits({ visitMinutes: 241 }), WORK).visitMinutes).toBeDefined();
    expect(checkVisitSettings(visits({ visitsPerSlot: 4 }), WORK).visitsPerSlot).toBeDefined();
    expect(checkVisitSettings(visits({ daysAhead: 46 }), WORK).daysAhead).toBeDefined();
    expect(checkVisitSettings(visits({ daysShown: 10 }), WORK).daysShown).toBeDefined();
    expect(
      checkVisitSettings(visits({ missedAfterMinutes: -1 }), WORK).missedAfterMinutes,
    ).toBeDefined();
    expect(
      checkVisitSettings(visits({ reminders: { ...V.reminders, hoursBefore: 0 } }), WORK),
    ).toEqual({});
  });
  it('shows no more days than customers can book ahead', () => {
    expect(checkVisitSettings(visits({ daysAhead: 5, daysShown: 7 }), WORK).daysShown).toMatch(
      /more days \(7\)/,
    );
  });
  it('keeps the notice shorter than the days ahead', () => {
    expect(
      checkVisitSettings(visits({ daysAhead: 2, daysShown: 2, customerNoticeHours: 48 }), WORK)
        .customerNoticeHours,
    ).toMatch(/shorter/);
  });
  it('needs at least one time, each valid, earliest first, not overlapping', () => {
    expect(checkVisitSettings(visits({ slotStarts: [] }), WORK).slotStarts).toMatch(/at least one/);
    expect(
      checkVisitSettings(visits({ slotStarts: ['10:00', 'abc'] }), WORK)['slotStarts.1'],
    ).toMatch(/Pick a time/);
    expect(
      checkVisitSettings(visits({ slotStarts: ['14:00', '10:00'] }), WORK)['slotStarts.1'],
    ).toMatch(/earliest first/);
    expect(
      checkVisitSettings(visits({ slotStarts: ['10:00', '11:00'] }), WORK)['slotStarts.1'],
    ).toMatch(/starts before the 10:00 visit ends/);
  });
  it('keeps each time inside the hours and out of lunch', () => {
    expect(checkVisitSettings(visits({ slotStarts: ['09:00'] }), WORK)['slotStarts.0']).toMatch(
      /before opening/,
    );
    expect(checkVisitSettings(visits({ slotStarts: ['17:30'] }), WORK)['slotStarts.0']).toMatch(
      /after closing/,
    );
    expect(checkVisitSettings(visits({ slotStarts: ['12:30'] }), WORK)['slotStarts.0']).toMatch(
      /runs into lunch/,
    );
    expect(
      checkVisitSettings(visits({ slotStarts: ['12:30'] }), {
        ...WORK,
        lunchStart: null,
        lunchEnd: null,
      }),
    ).toEqual({});
  });
  it('keeps reminder and alert times inside working hours', () => {
    const late = checkVisitSettings(
      visits({ reminders: { ...V.reminders, dayBeforeAt: '20:00', notConfirmedAlertAt: '08:00' } }),
      WORK,
    );
    expect(late['reminders.dayBeforeAt']).toMatch(/inside working hours/);
    expect(late['reminders.notConfirmedAlertAt']).toMatch(/inside working hours/);
  });
  it('checks against the saved Saturday-off hours too', () => {
    const errors = checkVisitSettings(V, { ...WORK, dayEnd: '17:00' });
    expect(errors['slotStarts.4']).toMatch(/after closing/);
  });
});

describe('visits a calendar change leaves outside', () => {
  const cal = calendarOf({ ...WORK, weeklyOff: [0, 6], dayEnd: '17:00' }, 'Asia/Kolkata', [
    '2026-11-10',
  ]);
  it('lists visits on a day off, a holiday, after closing or in lunch; keeps the rest', () => {
    const upcoming = [
      { id: 'sat', day: '2026-11-07', startMin: 600, endMin: 690 },
      { id: 'hol', day: '2026-11-10', startMin: 600, endMin: 690 },
      { id: 'late', day: '2026-11-09', startMin: 1020, endMin: 1110 },
      { id: 'lunch', day: '2026-11-09', startMin: 750, endMin: 840 },
      { id: 'ok', day: '2026-11-09', startMin: 600, endMin: 690 },
      { id: 'legacy', day: '2026-11-09', startMin: null, endMin: null },
      { id: 'legacy-sat', day: '2026-11-07', startMin: null, endMin: null },
    ];
    expect(visitsOutsideCalendar(cal, upcoming).map((v) => v.id)).toEqual([
      'sat',
      'hol',
      'late',
      'lunch',
      'legacy-sat',
    ]);
  });
});
