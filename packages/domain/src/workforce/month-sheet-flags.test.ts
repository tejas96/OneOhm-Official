import { describe, expect, it } from 'vitest';
import { isAmber, monthRow } from './month-sheet';
import { person, rules, WORKING, worked } from './month-sheet.fixtures';

describe('month sheet: flags', () => {
  it('lists each kind with its days', () => {
    const facts = person({
      attendance: WORKING.filter((day) => day !== '2026-10-06' && day !== '2026-10-07').map((day) =>
        worked(day, 9.5, 18.5, {
          autoClosed: day === '2026-10-12',
          tapDelayed: day === '2026-10-13',
        }),
      ),
      leaves: [
        {
          id: 'p',
          leaveType: 'casual',
          fromDate: '2026-10-06',
          toDate: '2026-10-06',
          halfDay: false,
          status: 'pending',
          paid: null,
        },
      ],
      openCorrections: ['2026-10-12'],
      claims: [
        { id: 'c', workDate: '2026-10-14', amountPaise: 5_000, status: 'pending', paid: false },
      ],
      doubtfulVisits: ['2026-10-15'],
      openAlerts: ['2026-10-16'],
    });
    const row = monthRow(facts, rules());
    expect(row.flags).toEqual([
      { kind: 'auto_closed', days: ['2026-10-12'] },
      { kind: 'delayed_tap', days: ['2026-10-13'] },
      { kind: 'open_correction', days: ['2026-10-12'] },
      { kind: 'pending_leave', days: ['2026-10-06'] },
      { kind: 'pending_travel', days: ['2026-10-14'] },
      { kind: 'doubtful_visit', days: ['2026-10-15'] },
      { kind: 'open_alert', days: ['2026-10-16'] },
      { kind: 'absent_no_reason', days: ['2026-10-07'] },
    ]);
    expect(row.money.travelPendingPaise).toBe(5_000);
  });

  it('a clean month has no flags', () => {
    const row = monthRow(person({ attendance: WORKING.map((day) => worked(day)) }), rules());
    expect(row.flags).toEqual([]);
    expect(isAmber(row)).toBe(false);
    expect(row.counts.payableDays).toBe(31);
    expect(row.money.grossPaise).toBe(3_100_000);
  });

  it("leaves today's open alerts to the live map", () => {
    const facts = person({
      attendance: [worked('2026-10-12'), { ...worked('2026-10-13'), checkOutAt: null }],
      openAlerts: ['2026-10-12', '2026-10-13'],
    });
    const row = monthRow(facts, rules({ today: '2026-10-13' }));
    expect(row.flags.find((flag) => flag.kind === 'open_alert')?.days).toEqual(['2026-10-12']);
  });
});
