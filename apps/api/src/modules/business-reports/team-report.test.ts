import { reportBuckets } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { leaveWithin, type TeamLeave, type TeamTask } from './team-report.read';
import { buildTeam, tally } from './team-report.service';

const range = { start: '2026-11-01', end: '2026-11-20' };
const scope = {
  today: '2026-11-20',
  meta: { range, granularity: 'week' as const, buckets: reportBuckets(range, 'week') },
};
const SUNDAY_OFF = [0];

const task = (patch: Partial<TeamTask>): TeamTask => ({
  userId: 'asha',
  party: 'internal',
  dueDate: '2026-11-10',
  finishedOn: null,
  open: true,
  waiting: false,
  ...patch,
});
const leave = (patch: Partial<TeamLeave>): TeamLeave => ({
  id: 'leave-1',
  userId: 'asha',
  name: 'Asha (test)',
  leaveType: 'casual',
  fromDate: '2026-11-02',
  toDate: '2026-11-03',
  halfDay: false,
  halfDays: 4,
  ...patch,
});

describe('tally', () => {
  it('counts on time, late (and late on others), open and past due', () => {
    const counts = tally(
      [
        task({ finishedOn: '2026-11-10', open: false }),
        task({ finishedOn: '2026-11-12', open: false }),
        task({ finishedOn: '2026-11-12', open: false, party: 'discom', reworks: 2 }),
        task({ dueDate: '2026-11-19' }),
        task({ dueDate: '2026-11-18', waiting: true, party: 'customer' }),
        task({ dueDate: '2026-11-22' }),
      ],
      scope.today,
    );
    // The DISCOM's delay and the task waiting on the customer do not count against Asha.
    expect(counts).toEqual({
      finished: 3,
      onTime: 1,
      late: 2,
      lateOnOthers: 1,
      onTimeRate: 1 / 2,
      reworked: 1,
      firstTimeRightRate: 2 / 3,
      open: 3,
      pastDue: 1,
    });
  });
});

describe('leaveWithin', () => {
  const period = { from: '2026-11-01', to: '2026-11-20' };

  it('keeps the approved half days for leave wholly inside the period', () => {
    expect(
      leaveWithin(leave({ halfDay: true, toDate: '2026-11-02', halfDays: 1 }), period, []),
    ).toBe(1);
  });

  it('counts only the working days inside the period for leave across its edge', () => {
    // 19–24 Nov: 19, 20 inside; the 22nd is a Sunday but falls outside anyway.
    const across = leave({ fromDate: '2026-11-19', toDate: '2026-11-24', halfDays: 10 });
    expect(leaveWithin(across, period, SUNDAY_OFF)).toBe(4);
    expect(leaveWithin(leave({ fromDate: '2026-11-21', toDate: '2026-11-22' }), period, [])).toBe(
      0,
    );
  });
});

describe('buildTeam', () => {
  const report = buildTeam(scope, {
    tasks: [
      task({ finishedOn: '2026-11-04', dueDate: '2026-11-05', open: false }),
      task({ userId: 'mahesh', finishedOn: '2026-11-11', dueDate: '2026-11-12', open: false }),
      task({ userId: 'mahesh', dueDate: '2026-11-15' }),
    ],
    people: [
      { id: 'asha', name: 'Asha (test)', designation: 'HR', contractorId: null },
      { id: 'mahesh', name: 'Mahesh (test)', designation: null, contractorId: 'kamble' },
      { id: 'idle', name: 'Idle (test)', designation: null, contractorId: null },
    ],
    crews: [{ id: 'kamble', name: 'Kamble Solar Installers (test)' }],
    leave: [leave({}), leave({ id: 'leave-2', fromDate: '2026-11-20', toDate: '2026-11-23' })],
    attendance: [{ userId: 'asha', present: 12, late: 2 }],
    policy: {
      weeklyOff: SUNDAY_OFF,
      leaveTypes: [{ key: 'casual', label: 'Casual leave', daysPerYear: 12 }],
    },
  });

  it('lists staff with something to show, and crews by their members’ tasks', () => {
    expect(report.people.map((row) => row.userId)).toEqual(['asha']);
    expect(report.people[0]).toMatchObject({
      finished: 1,
      onTime: 1,
      onLeaveToday: true,
      leaveHalfDays: 6,
      daysPresent: 12,
      lateCheckIns: 2,
    });
    expect(report.crews[0]).toMatchObject({ members: 1, finished: 1, onTime: 1, pastDue: 1 });
  });

  it('adds up leave taken, leave ahead and who is away today', () => {
    expect(report.totals).toMatchObject({
      finished: 2,
      pastDue: 1,
      peopleBehind: 1,
      leaveHalfDays: 6,
      // 21–23 Nov after today: the 21st and 23rd are working days, the 22nd a Sunday.
      leaveAheadHalfDays: 4,
      awayToday: 1,
    });
    expect(report.away.map((row) => [row.requestId, row.today, row.leaveType])).toEqual([
      ['leave-2', true, 'Casual leave'],
    ]);
  });

  it('splits finished tasks by week for staff and crews', () => {
    const first = report.byBucket.find((row) => row.start === '2026-11-02');
    const second = report.byBucket.find((row) => row.start === '2026-11-09');
    expect(first).toMatchObject({ staffOnTime: 1, crewOnTime: 0 });
    expect(second).toMatchObject({ staffOnTime: 0, crewOnTime: 1 });
  });
});
