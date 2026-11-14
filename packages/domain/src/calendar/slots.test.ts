import { describe, expect, it } from 'vitest';
import { type BusinessCalendar, DEFAULT_CALENDAR } from './business-calendar';
import { bookableDays, daySlots, freeTimes, overlaps, slotHalf, slotLabel } from './slots';
import { DEFAULT_VISIT_SETTINGS, type VisitSettings } from './visit-settings';

const V = DEFAULT_VISIT_SETTINGS;
const ist = (iso: string) => new Date(`${iso}:00+05:30`);
// 2026-11-05 Thursday, 06 Friday, 07 Saturday, 08 Sunday, 09 Monday.

describe('day slots', () => {
  it('lists the default five slots of a working day, in order, with labels', () => {
    const slots = daySlots(DEFAULT_CALENDAR, V, '2026-11-05');
    expect(slots.map((s) => [s.startMin, s.endMin])).toEqual([
      [600, 690],
      [690, 780],
      [840, 930],
      [930, 1020],
      [1020, 1110],
    ]);
    expect(slots[0]?.label).toBe('10:00–11:30 am');
    expect(slots[2]?.label).toBe('2:00–3:30 pm');
  });
  it('has none on the weekly day off or a holiday', () => {
    expect(daySlots(DEFAULT_CALENDAR, V, '2026-11-08')).toEqual([]);
    const holiday: BusinessCalendar = { ...DEFAULT_CALENDAR, holidays: new Set(['2026-11-05']) };
    expect(daySlots(holiday, V, '2026-11-05')).toEqual([]);
    expect(daySlots(holiday, V, '2026-11-06')).toHaveLength(5);
  });
  it('drops a slot that overlaps lunch, runs past closing or starts before opening', () => {
    const lunchy: VisitSettings = {
      ...V,
      slotStarts: ['10:00', '12:00', '14:00', '17:30', '09:00'],
    };
    expect(daySlots(DEFAULT_CALENDAR, lunchy, '2026-11-05').map((s) => s.startMin)).toEqual([
      600, 840,
    ]);
  });
  it('keeps every slot when there is no lunch', () => {
    const none: BusinessCalendar = { ...DEFAULT_CALENDAR, lunch: null };
    const mid: VisitSettings = { ...V, slotStarts: ['12:00', '13:30'] };
    expect(daySlots(none, mid, '2026-11-05')).toHaveLength(2);
  });
});

describe('bookable days', () => {
  it('a customer gets today only while a slot is at least the notice hours away', () => {
    // Thursday 14:00: the 17:00 slot is 3 h away, so today is bookable.
    expect(bookableDays(DEFAULT_CALENDAR, V, ist('2026-11-05T14:00'), 'customer')[0]).toBe(
      '2026-11-05',
    );
    // 14:01: no slot is 3 h away any more, so the first day is tomorrow.
    expect(bookableDays(DEFAULT_CALENDAR, V, ist('2026-11-05T14:01'), 'customer')[0]).toBe(
      '2026-11-06',
    );
  });
  it('staff may book later today unless the setting is off', () => {
    const now = ist('2026-11-05T16:00');
    expect(bookableDays(DEFAULT_CALENDAR, V, now, 'staff')[0]).toBe('2026-11-05');
    expect(
      bookableDays(DEFAULT_CALENDAR, { ...V, staffMayBookToday: false }, now, 'staff')[0],
    ).toBe('2026-11-06');
    // After the last slot started, today is gone for staff too.
    expect(bookableDays(DEFAULT_CALENDAR, V, ist('2026-11-05T17:30'), 'staff')[0]).toBe(
      '2026-11-06',
    );
  });
  it('skips the weekly off day and holidays, and stops after daysAhead', () => {
    const cal: BusinessCalendar = { ...DEFAULT_CALENDAR, holidays: new Set(['2026-11-09']) };
    const days = bookableDays(cal, { ...V, daysAhead: 7 }, ist('2026-11-06T20:00'), 'customer');
    expect(days).toEqual(['2026-11-07', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  });
  it('follows a Saturday-off calendar', () => {
    const cal: BusinessCalendar = { ...DEFAULT_CALENDAR, weeklyOff: [0, 6] };
    const days = bookableDays(cal, { ...V, daysAhead: 5 }, ist('2026-11-05T20:00'), 'customer');
    expect(days).toEqual(['2026-11-06', '2026-11-09', '2026-11-10']);
  });
});

describe('free times', () => {
  const now = ist('2026-11-04T09:00');
  it('removes slots a busy span overlaps', () => {
    const busy = [{ startMin: 11 * 60 + 40, endMin: 13 * 60 }];
    const times = freeTimes(DEFAULT_CALENDAR, V, '2026-11-05', busy, now, 'customer');
    expect(times.map((t) => t.startMin)).toEqual([600, 840, 930, 1020]);
  });
  it('allows two busy spans per slot when visitsPerSlot is 2, not 3 when it is 3', () => {
    const slot = { startMin: 600, endMin: 690 };
    const two = freeTimes(
      DEFAULT_CALENDAR,
      { ...V, visitsPerSlot: 2 },
      '2026-11-05',
      [slot, slot],
      now,
      'staff',
    );
    expect(two.map((t) => t.startMin)).not.toContain(600);
    const one = freeTimes(
      DEFAULT_CALENDAR,
      { ...V, visitsPerSlot: 2 },
      '2026-11-05',
      [slot],
      now,
      'staff',
    );
    expect(one.map((t) => t.startMin)).toContain(600);
  });
  it('is empty all day for a person on leave (busy the whole day)', () => {
    const leave = [{ startMin: 0, endMin: 1440 }];
    expect(freeTimes(DEFAULT_CALENDAR, V, '2026-11-05', leave, now, 'staff')).toEqual([]);
  });
  it('customers need the notice, staff only a future start, today', () => {
    const at = ist('2026-11-05T13:30');
    const today = '2026-11-05';
    expect(
      freeTimes(DEFAULT_CALENDAR, V, today, [], at, 'customer').map((t) => t.startMin),
    ).toEqual([1020]);
    expect(freeTimes(DEFAULT_CALENDAR, V, today, [], at, 'staff').map((t) => t.startMin)).toEqual([
      840, 930, 1020,
    ]);
  });
  it('has nothing on a past day or beyond daysAhead', () => {
    expect(freeTimes(DEFAULT_CALENDAR, V, '2026-11-03', [], now, 'staff')).toEqual([]);
    expect(freeTimes(DEFAULT_CALENDAR, V, '2026-12-30', [], now, 'staff')).toEqual([]);
  });
});

describe('overlap, half and label', () => {
  it('overlaps only when the spans share time', () => {
    expect(overlaps({ startMin: 0, endMin: 60 }, { startMin: 60, endMin: 90 })).toBe(false);
    expect(overlaps({ startMin: 0, endMin: 61 }, { startMin: 60, endMin: 90 })).toBe(true);
  });
  it('maps a start to the older morning/afternoon column', () => {
    expect(slotHalf(600)).toBe('morning');
    expect(slotHalf(690)).toBe('morning');
    expect(slotHalf(840)).toBe('afternoon');
  });
  it('says a slot in each language', () => {
    expect(slotLabel(600, 690, 'en')).toBe('10:00–11:30 am');
    expect(slotLabel(690, 810, 'en')).toBe('11:30 am–1:30 pm');
    expect(slotLabel(600, 690, 'mr')).toBe('सकाळी 10:00–11:30');
    expect(slotLabel(840, 930, 'hi')).toBe('दोपहर 2:00–3:30');
  });
});
