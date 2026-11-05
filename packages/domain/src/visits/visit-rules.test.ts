import { describe, expect, it } from 'vitest';
import {
  confirmDeadline,
  freeSlots,
  freeVisitDays,
  isPresenceKind,
  isWorkingDay,
  nextWorkingDay,
  previousWorkingDay,
  reminderDue,
  visitKindOfTask,
  visitMissed,
  zonedInstant,
} from './visit-rules';

// 2026-11-05 is a Thursday; 2026-11-08 a Sunday.
describe('working days', () => {
  it('Sunday is closed; Saturday works', () => {
    expect(isWorkingDay('2026-11-07')).toBe(true);
    expect(isWorkingDay('2026-11-08')).toBe(false);
    expect(nextWorkingDay('2026-11-07')).toBe('2026-11-09');
    expect(previousWorkingDay('2026-11-09')).toBe('2026-11-07');
    expect(previousWorkingDay('2026-11-06')).toBe('2026-11-05');
  });
});

describe('free days', () => {
  it('starts tomorrow and skips Sundays', () => {
    expect(freeVisitDays({ today: '2026-11-05', count: 4 })).toEqual([
      '2026-11-06',
      '2026-11-07',
      '2026-11-09',
      '2026-11-10',
    ]);
  });
  it('skips leave and days with both slots taken, keeps a day with one free slot', () => {
    const days = freeVisitDays({
      today: '2026-11-05',
      count: 3,
      leave: new Set(['2026-11-06']),
      taken: { '2026-11-07': ['morning', 'afternoon'], '2026-11-09': ['morning'] },
    });
    expect(days).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
    expect(freeSlots(['morning'])).toEqual(['afternoon']);
  });
  it('gives up after the horizon', () => {
    const leave = new Set(
      Array.from({ length: 60 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`),
    );
    expect(freeVisitDays({ today: '2026-11-30', count: 3, leave, horizon: 5 })).toEqual([]);
  });
});

describe('the day-before reminder', () => {
  const base = { visitDay: '2026-11-09', confirmedOn: '2026-11-03', working: true };
  it('a Monday visit is reminded on Saturday, not Sunday', () => {
    expect(reminderDue({ ...base, today: '2026-11-07' })).toBe(true);
    expect(reminderDue({ ...base, today: '2026-11-06' })).toBe(false);
    expect(reminderDue({ ...base, today: '2026-11-08' })).toBe(true);
  });
  it('a Thursday visit is reminded on Wednesday; never outside working hours or on the day', () => {
    const thu = { ...base, visitDay: '2026-11-05' };
    expect(reminderDue({ ...thu, today: '2026-11-04' })).toBe(true);
    expect(reminderDue({ ...thu, today: '2026-11-04', working: false })).toBe(false);
    expect(reminderDue({ ...thu, today: '2026-11-05' })).toBe(false);
  });
  it('a visit booked the day before is not reminded', () => {
    expect(reminderDue({ ...base, confirmedOn: '2026-11-07', today: '2026-11-07' })).toBe(false);
  });
});

describe('missed and kinds', () => {
  const tz = 'Asia/Kolkata';
  it('missed after 6:30 pm on its day, or any later day', () => {
    expect(visitMissed('2026-11-05', new Date('2026-11-05T11:00:00Z'), tz)).toBe(false);
    expect(visitMissed('2026-11-05', new Date('2026-11-05T13:00:00Z'), tz)).toBe(true);
    expect(visitMissed('2026-11-05', new Date('2026-11-06T04:00:00Z'), tz)).toBe(true);
    expect(visitMissed('2026-11-06', new Date('2026-11-05T13:00:00Z'), tz)).toBe(false);
  });
  it('knows the visit a task is', () => {
    expect(visitKindOfTask('site_survey')).toBe('survey');
    expect(visitKindOfTask('panel_installation')).toBe('installation');
    expect(visitKindOfTask('net_meter_installation')).toBe('net_meter');
    expect(visitKindOfTask('discom_application')).toBeNull();
    expect(isPresenceKind('inspection')).toBe(true);
    expect(isPresenceKind('survey')).toBe(false);
  });
});

describe('the promise to confirm', () => {
  const tz = 'Asia/Kolkata';
  it('a pick in working hours is promised for 6:30 pm that day', () => {
    // 2026-11-05 is a Thursday; 11:00 UTC is 16:30 in India.
    expect(confirmDeadline(new Date('2026-11-05T11:00:00Z'), tz).toISOString()).toBe(
      '2026-11-05T13:00:00.000Z',
    );
  });
  it('a pick on Saturday evening is promised for noon on Monday', () => {
    expect(confirmDeadline(new Date('2026-11-07T14:00:00Z'), tz).toISOString()).toBe(
      '2026-11-09T06:30:00.000Z',
    );
  });
  it('turns a local clock time into an instant', () => {
    expect(zonedInstant('2026-11-05', 12 * 60, tz).toISOString()).toBe('2026-11-05T06:30:00.000Z');
  });
});
