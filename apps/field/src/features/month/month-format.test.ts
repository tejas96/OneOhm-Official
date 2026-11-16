import { describe, expect, it } from 'vitest';
import {
  calendarWeeks,
  canGoNext,
  dayList,
  formatDays,
  formatHours,
  lastDayOf,
  monthOf,
  shiftMonth,
} from './month-format';

const daysOf = (month: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, '0')}` }));

describe('shiftMonth', () => {
  it('crosses year ends', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-11', 0)).toBe('2026-11');
  });
});

describe('month helpers', () => {
  it('knows the month and its last day', () => {
    expect(monthOf('2026-11-16')).toBe('2026-11');
    expect(lastDayOf('2026-02')).toBe('2026-02-28');
  });
  it('lets the person go forward only to this month', () => {
    expect(canGoNext('2026-10', '2026-11-16')).toBe(true);
    expect(canGoNext('2026-11', '2026-11-16')).toBe(false);
  });
});

describe('calendarWeeks', () => {
  it('puts the 1st on its weekday, Monday first', () => {
    // 1 Nov 2026 is a Sunday: six blanks, then the 1st.
    const weeks = calendarWeeks(daysOf('2026-11', 30));
    expect(weeks[0]?.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(weeks[0]?.[6]?.date).toBe('2026-11-01');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks).toHaveLength(6);
  });
  it('needs no blanks when the month starts on a Monday', () => {
    // 1 Jun 2026 is a Monday and June has 30 days.
    const weeks = calendarWeeks(daysOf('2026-06', 30));
    expect(weeks[0]?.[0]?.date).toBe('2026-06-01');
    expect(weeks).toHaveLength(5);
  });
  it('is empty with no days', () => {
    expect(calendarWeeks([])).toEqual([]);
  });
});

describe('formatting', () => {
  it('writes days with halves', () => {
    expect(formatDays(18.5)).toBe('18.5 days');
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(0)).toBe('0 days');
  });
  it('writes hours', () => {
    expect(formatHours(510)).toBe('8 h 30 min');
    expect(formatHours(540)).toBe('9 h');
    expect(formatHours(45)).toBe('45 min');
  });
  it('lists flag days and trims long lists', () => {
    const more = (n: number) => `+${n} more`;
    expect(dayList(['2026-11-12', '2026-11-15'], more)).toBe('12, 15 Nov');
    expect(
      dayList(
        daysOf('2026-11', 6).map((d) => d.date),
        more,
      ),
    ).toBe('1, 2, 3, 4 Nov +2 more');
    expect(dayList([], more)).toBe('');
  });
});
