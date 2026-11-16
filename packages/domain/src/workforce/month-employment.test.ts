import { describe, expect, it } from 'vitest';
import { employmentPeriods, employmentStatus, payOn } from './month-employment';
import { monthRow } from './month-sheet';
import { person, rules, WORKING, worked } from './month-sheet.fixtures';

describe('employment periods', () => {
  it('ends a period at each departure and starts one at each rejoin', () => {
    const periods = employmentPeriods(
      '2026-01-05',
      [
        { kind: 'left', day: '2026-10-09' },
        { kind: 'rejoined', day: '2026-10-20' },
      ],
      null,
    );
    expect(periods).toEqual([
      { from: '2026-01-05', to: '2026-10-09' },
      { from: '2026-10-20', to: null },
    ]);
    expect(employmentStatus(periods, '2026-01-04')).toBe('not_joined');
    expect(employmentStatus(periods, '2026-10-09')).toBeNull();
    expect(employmentStatus(periods, '2026-10-15')).toBe('left');
    expect(employmentStatus(periods, '2026-10-20')).toBeNull();
  });

  it('uses the current last working day when no departure was recorded', () => {
    expect(employmentPeriods('2026-01-05', [], '2026-10-09')).toEqual([
      { from: '2026-01-05', to: '2026-10-09' },
    ]);
  });

  it('days between leaving and rejoining are "left" on the sheet and not paid', () => {
    const facts = person({
      periods: [
        { from: '2026-01-01', to: '2026-10-09' },
        { from: '2026-10-20', to: null },
      ],
      attendance: WORKING.filter((day) => day <= '2026-10-09' || day >= '2026-10-20').map((day) =>
        worked(day),
      ),
    });
    const row = monthRow(facts, rules());
    expect(row.days.find((day) => day.date === '2026-10-14')?.status).toBe('left');
    // 10–19 Oct: 10 days away (including Sunday the 11th and 18th).
    expect(row.counts).toMatchObject({ notEmployed: 10, payableDays: 21 });
    expect(row.flags).toEqual([]);
  });
});

describe('pay history', () => {
  const history = [
    { monthlyPayPaise: 2_500_000, effectiveFrom: '2026-11-16' },
    { monthlyPayPaise: 2_800_000, effectiveFrom: '2026-12-01' },
  ];

  it('takes the pay in force on the day; the first pay covers earlier months', () => {
    expect(payOn(history, '2026-10-31')).toBe(2_500_000);
    expect(payOn(history, '2026-11-30')).toBe(2_500_000);
    expect(payOn(history, '2026-12-31')).toBe(2_800_000);
    expect(payOn([], '2026-12-31')).toBeNull();
  });

  it('a cleared pay stays cleared from its day', () => {
    expect(
      payOn([...history, { monthlyPayPaise: null, effectiveFrom: '2027-01-01' }], '2027-01-31'),
    ).toBeNull();
  });
});

describe('offs need work in the week', () => {
  /** Absent all of 12–17 Oct: Sunday the 18th is not paid. */
  const absentWeek = () =>
    person({
      attendance: WORKING.filter((day) => day < '2026-10-12' || day > '2026-10-18').map((day) =>
        worked(day),
      ),
    });

  it('a fully absent week gets no paid weekly off', () => {
    const row = monthRow(absentWeek(), rules());
    expect(row.days.find((day) => day.date === '2026-10-18')).toMatchObject({
      status: 'weekly_off',
      offUnpaid: true,
    });
    expect(row.counts).toMatchObject({ absent: 6, weeklyOffs: 3, unpaidOffs: 1, payableDays: 24 });
  });

  it('paid leave in the week keeps the off paid; unpaid leave does not', () => {
    const leaveOn = (paid: boolean | null, kind: string) =>
      person({
        ...absentWeek(),
        leaves: [
          {
            id: 'l',
            leaveType: kind,
            fromDate: '2026-10-12',
            toDate: '2026-10-12',
            halfDay: false,
            status: 'approved',
            paid,
          },
        ],
      });
    expect(monthRow(leaveOn(null, 'casual'), rules()).counts.unpaidOffs).toBe(0);
    expect(monthRow(leaveOn(null, 'unpaid'), rules()).counts.unpaidOffs).toBe(1);
  });

  it('reads the week across the month edge, waits for a running week, and can be switched off', () => {
    // Sunday 1 Nov 2026 closes the week of 26–31 Oct, which was worked.
    const november = person({ attendance: ['2026-10-26', '2026-11-02'].map((day) => worked(day)) });
    const nov = monthRow(november, rules({ month: '2026-11', today: '2026-11-03' }));
    expect(nov.days[0]).toMatchObject({ status: 'weekly_off', offUnpaid: false });
    const running = monthRow(absentWeek(), rules({ today: '2026-10-18' }));
    expect(running.counts.unpaidOffs).toBe(0);
    expect(monthRow(absentWeek(), rules({ offsNeedWorkInWeek: false })).counts.unpaidOffs).toBe(0);
  });
});

describe('a leave paid flag frozen at approval', () => {
  it('wins over the kind as it is now', () => {
    const facts = person({
      attendance: WORKING.filter((day) => day !== '2026-10-06').map((day) => worked(day)),
      leaves: [
        {
          id: 'l',
          leaveType: 'casual',
          fromDate: '2026-10-06',
          toDate: '2026-10-06',
          halfDay: false,
          status: 'approved',
          paid: false,
        },
      ],
    });
    expect(monthRow(facts, rules()).counts).toMatchObject({ paidLeave: 0, unpaidLeave: 1 });
  });
});
