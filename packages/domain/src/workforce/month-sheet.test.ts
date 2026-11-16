import { describe, expect, it } from 'vitest';
import { grossPayPaise, isAmber, lateDeductionDays, monthRow } from './month-sheet';
import { person, rules, WORKING, worked } from './month-sheet.fixtures';
import type { MonthPersonFacts } from './month-sheet-types';

/** The full mix: a short day, an absence, paid and unpaid leave, a half-day leave, three lates. */
function fullMonth(): MonthPersonFacts {
  const special = new Set(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  const late = new Set(['2026-10-12', '2026-10-13', '2026-10-14']);
  return person({
    attendance: [
      ...WORKING.filter((day) => !special.has(day)).map((day) =>
        worked(day, late.has(day) ? 10 : 9.5, 18.5, { late: late.has(day) }),
      ),
      worked('2026-10-05', 10, 12.5),
      worked('2026-10-09', 14, 18.5),
    ],
    leaves: [
      {
        id: 'l1',
        leaveType: 'casual',
        fromDate: '2026-10-07',
        toDate: '2026-10-07',
        halfDay: false,
        status: 'approved',
        paid: null,
      },
      {
        id: 'l2',
        leaveType: 'unpaid',
        fromDate: '2026-10-08',
        toDate: '2026-10-08',
        halfDay: false,
        status: 'approved',
        paid: null,
      },
      {
        id: 'l3',
        leaveType: 'casual',
        fromDate: '2026-10-09',
        toDate: '2026-10-09',
        halfDay: true,
        status: 'approved',
        paid: null,
      },
    ],
    claims: [
      { id: 'c1', workDate: '2026-10-12', amountPaise: 42_000, status: 'approved', paid: true },
      { id: 'c2', workDate: '2026-10-13', amountPaise: 18_000, status: 'approved', paid: false },
      { id: 'c3', workDate: '2026-09-30', amountPaise: 99_900, status: 'approved', paid: true },
    ],
    bonuses: [
      { id: 'b1', amountPaise: 150_000, reason: 'Fast install', approvedOn: '2026-10-20' },
      { id: 'b2', amountPaise: 70_000, reason: 'Last month', approvedOn: '2026-09-28' },
    ],
  });
}

describe('month sheet: a full month', () => {
  const row = monthRow(fullMonth(), rules());

  it('counts each kind of day', () => {
    expect(row.counts).toMatchObject({
      daysInMonth: 31,
      countedTo: '2026-10-31',
      workingDays: 26,
      present: 21,
      halfDays: 2,
      absent: 1,
      paidLeave: 1.5,
      unpaidLeave: 1,
      holidays: 1,
      weeklyOffs: 4,
      lates: 3,
      lateDeduction: 0.5,
      payableDays: 28,
    });
  });

  it('pays gross on payable days over calendar days, to the rupee', () => {
    expect(row.money.grossPaise).toBe(2_800_000);
  });

  it('splits travel into approved and paid, and counts bonuses approved in the month', () => {
    expect(row.money).toMatchObject({
      travelApprovedPaise: 60_000,
      travelPaidPaise: 42_000,
      travelPendingPaise: 0,
      bonusPaise: 150_000,
    });
  });

  it('names each day', () => {
    const status = (date: string) => row.days.find((day) => day.date === date)?.status;
    expect(status('2026-10-02')).toBe('holiday');
    expect(status('2026-10-04')).toBe('weekly_off');
    expect(status('2026-10-05')).toBe('half_day');
    expect(status('2026-10-06')).toBe('absent');
    expect(status('2026-10-07')).toBe('paid_leave');
    expect(status('2026-10-08')).toBe('unpaid_leave');
    expect(status('2026-10-09')).toBe('half_day');
    expect(row.days.find((day) => day.date === '2026-10-09')?.leave?.half).toBe(true);
  });

  it('flags the absence with no reason, and only that', () => {
    expect(row.flags).toEqual([{ kind: 'absent_no_reason', days: ['2026-10-06'] }]);
    expect(isAmber(row)).toBe(true);
  });
});

describe('month sheet: rules', () => {
  it('takes half a day for every N lates, and nothing when off', () => {
    expect(lateDeductionDays(2, 3)).toBe(0);
    expect(lateDeductionDays(3, 3)).toBe(0.5);
    expect(lateDeductionDays(5, 3)).toBe(0.5);
    expect(lateDeductionDays(6, 3)).toBe(1);
    expect(lateDeductionDays(10, 0)).toBe(0);
  });

  it('rounds gross pay to the rupee and has none without a monthly pay', () => {
    expect(grossPayPaise(2_500_000, 27.5, 30)).toBe(2_291_700);
    expect(grossPayPaise(null, 30, 30)).toBeNull();
  });

  it('with the late rule off, lates cost nothing', () => {
    const row = monthRow(fullMonth(), rules({ lateEvery: 0 }));
    expect(row.counts.lateDeduction).toBe(0);
    expect(row.counts.payableDays).toBe(28.5);
  });

  it('a day exactly at the half-day hours is present; a minute less is a half day', () => {
    const facts = person({
      attendance: [worked('2026-10-05', 9, 13), worked('2026-10-06', 9, 12 + 59 / 60)],
    });
    const row = monthRow(facts, rules());
    expect(row.days[4]?.status).toBe('present');
    expect(row.days[5]?.status).toBe('half_day');
    expect(row.days[4]?.workedMinutes).toBe(240);
  });

  it('a half-day leave with no work: half leave, half absent, flagged', () => {
    const facts = person({
      attendance: WORKING.filter((day) => day !== '2026-10-09').map((day) => worked(day)),
      leaves: [
        {
          id: 'l',
          leaveType: 'unpaid',
          fromDate: '2026-10-09',
          toDate: '2026-10-09',
          halfDay: true,
          status: 'approved',
          paid: null,
        },
      ],
    });
    const row = monthRow(facts, rules());
    expect(row.counts).toMatchObject({ unpaidLeave: 0.5, absent: 0.5, payableDays: 30 });
    expect(row.flags).toEqual([{ kind: 'absent_no_reason', days: ['2026-10-09'] }]);
  });

  it('unknown leave kinds count as paid', () => {
    const facts = person({
      attendance: WORKING.filter((day) => day !== '2026-10-06').map((day) => worked(day)),
      leaves: [
        {
          id: 'l',
          leaveType: 'old_kind',
          fromDate: '2026-10-06',
          toDate: '2026-10-06',
          halfDay: false,
          status: 'approved',
          paid: null,
        },
      ],
    });
    expect(monthRow(facts, rules()).counts.paidLeave).toBe(1);
  });

  it('work on a holiday or weekly off still counts the day off once', () => {
    const facts = person({
      attendance: [...WORKING, '2026-10-02', '2026-10-04'].map((day) => worked(day)),
    });
    const row = monthRow(facts, rules());
    expect(row.counts).toMatchObject({ present: 26, holidays: 1, weeklyOffs: 4, payableDays: 31 });
    expect(row.days[1]).toMatchObject({
      status: 'holiday',
      workedOnDayOff: true,
      holidayName: 'Gandhi Jayanti',
    });
  });
});

describe('month sheet: employment dates and the running month', () => {
  it('days before joining and after leaving are not counted', () => {
    const facts = person({
      periods: [{ from: '2026-10-15', to: '2026-10-24' }],
      attendance: WORKING.filter((day) => day >= '2026-10-15' && day <= '2026-10-24').map((day) =>
        worked(day),
      ),
    });
    const row = monthRow(facts, rules());
    expect(row.days[0]?.status).toBe('not_joined');
    expect(row.days[30]?.status).toBe('left');
    // 15–24 Oct: 9 working days and Sunday the 18th.
    expect(row.counts).toMatchObject({
      present: 9,
      weeklyOffs: 1,
      notEmployed: 21,
      payableDays: 10,
    });
    expect(row.money.grossPaise).toBe(1_000_000);
  });

  it('while the month runs, later days wait and today counts once checked in', () => {
    const facts = person({
      attendance: [worked('2026-10-12'), { ...worked('2026-10-13'), checkOutAt: null }],
    });
    const row = monthRow(facts, rules({ today: '2026-10-13' }));
    expect(row.counts.countedTo).toBe('2026-10-13');
    expect(row.days[12]).toMatchObject({ status: 'present', onDuty: true, workedMinutes: null });
    expect(row.days[13]?.status).toBe('upcoming');
    const quiet = monthRow(person({ attendance: [] }), rules({ today: '2026-10-13' }));
    expect(quiet.days[12]?.status).toBe('upcoming');
    expect(quiet.days[11]?.status).toBe('absent');
  });
});
