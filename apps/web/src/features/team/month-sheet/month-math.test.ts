import type { MonthDayRecord } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import {
  breakdownLines,
  dayCount,
  lastDayOf,
  lateText,
  monthFromParam,
  shiftMonth,
  weeksOf,
  workedText,
} from './month-math';

const day = (date: string) => ({ date }) as MonthDayRecord;

describe('month navigation', () => {
  it('steps across year ends', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });
  it('finds the last day, leap years included', () => {
    expect(lastDayOf('2026-10')).toBe('2026-10-31');
    expect(lastDayOf('2028-02')).toBe('2028-02-29');
  });
  it('falls back when the address holds no month', () => {
    expect(monthFromParam('2026-09', '2026-10')).toBe('2026-09');
    expect(monthFromParam('2026-13', '2026-10')).toBe('2026-10');
    expect(monthFromParam(null, '2026-10')).toBe('2026-10');
  });
});

describe('weeksOf', () => {
  it('starts on Monday and pads both ends', () => {
    // 1 Oct 2026 is a Thursday.
    const days = Array.from({ length: 31 }, (_, i) =>
      day(`2026-10-${String(i + 1).padStart(2, '0')}`),
    );
    const weeks = weeksOf(days);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.map((cell) => cell?.date ?? null)).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks[4]?.[6]).toBeNull();
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });
  it('is empty without days', () => {
    expect(weeksOf([])).toEqual([]);
  });
});

describe('wording of numbers', () => {
  it('shows halves and late deductions', () => {
    expect(dayCount(22)).toBe('22');
    expect(dayCount(1.5)).toBe('1.5');
    expect(lateText(3, 0.5)).toBe('3 (−0.5)');
    expect(lateText(2, 0)).toBe('2');
  });
  it('writes hours worked', () => {
    expect(workedText(495)).toBe('8h 15m');
    expect(workedText(480)).toBe('8h');
    expect(workedText(45)).toBe('45m');
    expect(workedText(null)).toBeNull();
  });
});

describe('breakdownLines', () => {
  const base = {
    present: 20,
    halfDays: 2,
    paidLeave: 1,
    holidays: 1,
    weeklyOffs: 4,
    lateDeduction: 0.5,
    payableDays: 26.5,
  };
  it('adds up to the payable days with no gap line', () => {
    const lines = breakdownLines(base);
    expect(lines.map((line) => line.key)).toEqual([
      'present',
      'half',
      'paidLeave',
      'holidays',
      'weeklyOffs',
      'late',
    ]);
    expect(lines.reduce((sum, line) => sum + line.days, 0)).toBe(26.5);
  });
  it('leaves out zero lines', () => {
    const lines = breakdownLines({ ...base, halfDays: 0, lateDeduction: 0, payableDays: 26 });
    expect(lines.map((line) => line.key)).toEqual([
      'present',
      'paidLeave',
      'holidays',
      'weeklyOffs',
    ]);
  });
  it('shows a gap as its own line so the sum is never wrong', () => {
    const lines = breakdownLines({ ...base, payableDays: 27.5 });
    expect(lines.at(-1)).toEqual({ key: 'other', days: 1 });
  });
});
