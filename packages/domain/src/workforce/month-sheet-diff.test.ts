import { describe, expect, it } from 'vitest';
import { DEFAULT_CALENDAR } from '../calendar/business-calendar';
import { monthRowDiff, monthRulesFrom } from './month-sheet-diff';
import { DEFAULT_WORKFORCE_POLICY, leaveIsPaid } from './policy';

const numbers = (payable: number, gross: number | null, travel = 0) => ({
  counts: {
    daysInMonth: 30,
    countedTo: '2026-09-30',
    workingDays: 26,
    present: 24,
    halfDays: 0,
    absent: 2,
    paidLeave: 0,
    unpaidLeave: 0,
    holidays: 0,
    weeklyOffs: 4,
    unpaidOffs: 0,
    notEmployed: 0,
    lates: 0,
    lateDeduction: 0,
    payableDays: payable,
    workedMinutes: 0,
  },
  money: {
    monthlyPayPaise: 3_000_000,
    grossPaise: gross,
    travelApprovedPaise: travel,
    travelPaidPaise: 0,
    travelPendingPaise: 0,
    bonusPaise: 0,
  },
});

describe('monthRowDiff', () => {
  it('is empty when nothing changed', () => {
    expect(monthRowDiff(numbers(28, 2_800_000), numbers(28, 2_800_000))).toEqual([]);
  });

  it('ignores a claim being paid: only what salary is made of counts', () => {
    const paid = numbers(28, 2_800_000);
    expect(
      monthRowDiff(paid, { ...paid, money: { ...paid.money, travelPaidPaise: 9_000 } }),
    ).toEqual([]);
  });

  it('lists each changed number with before and after', () => {
    const live = numbers(29, 2_900_000, 42_000);
    expect(monthRowDiff(numbers(28, 2_800_000), live)).toEqual([
      { field: 'payableDays', before: 28, after: 29 },
      { field: 'grossPaise', before: 2_800_000, after: 2_900_000 },
      { field: 'travelApprovedPaise', before: 0, after: 42_000 },
    ]);
  });
});

describe('monthRulesFrom', () => {
  it('takes the half-day hours, late rule and paid flags from the policy', () => {
    const policy = {
      ...DEFAULT_WORKFORCE_POLICY,
      leaveTypes: [
        { key: 'casual', label: 'Casual leave', daysPerYear: 12 },
        { key: 'unpaid', label: 'Unpaid leave', daysPerYear: 0, paid: false },
      ],
      attendance: { ...DEFAULT_WORKFORCE_POLICY.attendance, lateDeduction: { every: 3 } },
    };
    const rules = monthRulesFrom({
      month: '2026-10',
      today: '2026-11-16',
      policy,
      calendar: DEFAULT_CALENDAR,
      holidays: [{ day: '2026-10-02', name: 'Gandhi Jayanti' }],
    });
    expect(rules.halfDayHours).toBe(4);
    expect(rules.lateEvery).toBe(3);
    expect(rules.leaveKinds.get('casual')?.paid).toBe(true);
    expect(rules.leaveKinds.get('unpaid')?.paid).toBe(false);
    expect(rules.holidays.get('2026-10-02')).toBe('Gandhi Jayanti');
  });

  it('the late rule is off by default', () => {
    expect(DEFAULT_WORKFORCE_POLICY.attendance.lateDeduction.every).toBe(0);
    expect(leaveIsPaid(undefined)).toBe(true);
    expect(leaveIsPaid({ paid: false })).toBe(false);
  });
});
