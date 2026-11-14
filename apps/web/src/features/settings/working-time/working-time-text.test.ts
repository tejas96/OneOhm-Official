import { calendarOf } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { sortedSlots, toggledOff, withHoliday, withLunch } from './working-time-draft';
import { dayPieces, lunchText, openingParts } from './working-time-text';

const work = {
  weeklyOff: [0],
  dayStart: '09:30',
  dayEnd: '18:30',
  lunchStart: '13:00',
  lunchEnd: '14:00',
} as const;

describe('working time text', () => {
  it('says the opening line and lunch', () => {
    expect(openingParts(work)).toEqual({ open: 'Mon–Sat, 9:30 am–6:30 pm', lunch: '1–2 pm' });
    expect(lunchText(690, 780)).toBe('11:30 am–1 pm');
  });

  it('has no line while every day is off', () => {
    expect(openingParts({ ...work, weeklyOff: [0, 1, 2, 3, 4, 5, 6] })).toBeNull();
  });

  it('lists a day with lunch between the visits', () => {
    const cal = calendarOf(work);
    const visits = { visitMinutes: 90, slotStarts: ['10:00', '11:30', '14:00', '15:30'] };
    const texts = dayPieces(cal, visits, '2026-11-09').map((p) =>
      p.kind === 'lunch' ? 'lunch' : p.text,
    );
    expect(texts).toEqual(['10:00–11:30', '11:30–13:00', 'lunch', '14:00–15:30', '15:30–17:00']);
  });
});

describe('working time draft', () => {
  it('keeps holidays sorted, one per date', () => {
    const one = withHoliday([], '2026-11-12', 'Diwali') ?? [];
    const two = withHoliday(one, '2026-01-26', 'Republic Day') ?? [];
    expect(two.map((h) => h.day)).toEqual(['2026-01-26', '2026-11-12']);
    expect(withHoliday(two, '', 'x')).toBeNull();
  });

  it('keeps one working day', () => {
    expect(toggledOff([0, 1, 2, 3, 4, 5], 6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(toggledOff([0], 0)).toEqual([]);
  });

  it('turns lunch on and off', () => {
    const off = withLunch({ ...work, weeklyOff: [0], holidays: [] }, false);
    expect(off.lunchStart).toBeNull();
    expect(withLunch(off, true).lunchStart).toBe('13:00');
  });

  it('sorts visit times without repeats', () => {
    expect(sortedSlots(['14:00', '10:00'], '10:00')).toEqual(['10:00', '14:00']);
  });
});
