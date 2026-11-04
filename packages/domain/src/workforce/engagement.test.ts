import { describe, expect, it } from 'vitest';
import { employeeBonusPosting, isBalanced } from '../finance';
import { achievementsFrom, onTimeStreak } from './achievements';
import { checkBonus, MAX_BONUS_PAISE, splitBonus } from './bonus';
import {
  dueByWeek,
  leaveDaysByWeek,
  loadState,
  openTaskLimit,
  weekWindows,
  wouldOverload,
} from './capacity';
import { checkHandover, leaveTaskReason } from './leave-handover';
import { withPolicyDefaults } from './policy';
import { trackingSwitchedOn } from './tracking-switch';

describe('open-task limit', () => {
  it('uses the person’s own limit, then the company default, else none', () => {
    expect(openTaskLimit(8, 12)).toBe(8);
    expect(openTaskLimit(null, 12)).toBe(12);
    expect(openTaskLimit(0, 0)).toBeNull();
    expect(openTaskLimit(undefined, 0)).toBeNull();
  });

  it('says full at the limit and over above it', () => {
    expect(loadState(4, null)).toBe('ok');
    expect(loadState(4, 5)).toBe('ok');
    expect(loadState(5, 5)).toBe('full');
    expect(loadState(6, 5)).toBe('over');
    expect(wouldOverload(5, 5)).toBe(true);
    expect(wouldOverload(4, 5)).toBe(false);
    expect(wouldOverload(40, null)).toBe(false);
  });
});

describe('four-week load', () => {
  const weeks = weekWindows('2026-11-02', 4);

  it('makes four seven-day weeks from today', () => {
    expect(weeks[0]).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(weeks[3]).toEqual({ from: '2026-11-23', to: '2026-11-29' });
  });

  it('counts overdue work in the first week and leaves out later work', () => {
    expect(dueByWeek(['2026-10-20', '2026-11-05', '2026-11-10', '2026-12-20'], weeks)).toEqual([
      2, 1, 0, 0,
    ]);
  });

  it('counts leave days inside each week', () => {
    expect(leaveDaysByWeek([{ from: '2026-11-07', to: '2026-11-10' }], weeks)).toEqual([
      2, 2, 0, 0,
    ]);
  });

  it('counts a half day as half and keeps approved and pending apart', () => {
    // Asha: 5 Nov sick (approved), 9-10 Nov casual (pending), 11 Nov half day (approved).
    const week = weekWindows('2026-11-05', 1);
    const approved = [
      { from: '2026-11-05', to: '2026-11-05', halfDay: false },
      { from: '2026-11-11', to: '2026-11-11', halfDay: true },
    ];
    const pending = [{ from: '2026-11-09', to: '2026-11-10', halfDay: false }];
    expect(leaveDaysByWeek(approved, week)).toEqual([1.5]);
    expect(leaveDaysByWeek(pending, week)).toEqual([2]);
    expect(leaveDaysByWeek([], week)).toEqual([0]);
  });
});

describe('location switch per role and person', () => {
  const base = { company: true, roleKeys: ['sales'], byRole: {}, person: null } as const;

  it('follows the company with no overrides', () => {
    expect(trackingSwitchedOn(base)).toBe(true);
    expect(trackingSwitchedOn({ ...base, company: false })).toBe(false);
  });

  it('lets a role switch it on or off, with off winning between roles', () => {
    expect(trackingSwitchedOn({ ...base, company: false, byRole: { sales: true } })).toBe(true);
    expect(
      trackingSwitchedOn({
        ...base,
        roleKeys: ['sales', 'accounts'],
        byRole: { sales: true, accounts: false },
      }),
    ).toBe(false);
  });

  it('lets the person’s own setting win', () => {
    expect(trackingSwitchedOn({ ...base, byRole: { sales: false }, person: 'on' })).toBe(true);
    expect(trackingSwitchedOn({ ...base, person: 'off' })).toBe(false);
  });

  it('fills the new settings for a policy saved before them', () => {
    const policy = withPolicyDefaults({ attendance: { captureLocation: false } as never });
    expect(policy.attendance.autoCheckInFromSite).toBe(false);
    expect(policy.attendance.trackingByRole).toEqual({});
    expect(policy.capacity.defaultOpenTaskLimit).toBe(0);
  });
});

describe('leave and the work it touches', () => {
  const window = { fromDate: '2026-11-10', toDate: '2026-11-12' };

  it('names overdue, due-inside and spanning tasks, and leaves the rest', () => {
    const today = '2026-11-02';
    expect(leaveTaskReason({ startDate: '2026-10-20', dueDate: '2026-10-30' }, window, today)).toBe(
      'overdue',
    );
    expect(leaveTaskReason({ startDate: '2026-11-01', dueDate: '2026-11-11' }, window, today)).toBe(
      'due',
    );
    expect(leaveTaskReason({ startDate: '2026-11-08', dueDate: '2026-11-20' }, window, today)).toBe(
      'spans',
    );
    expect(
      leaveTaskReason({ startDate: '2026-11-03', dueDate: '2026-11-05' }, window, today),
    ).toBeNull();
    expect(
      leaveTaskReason({ startDate: '2026-11-15', dueDate: '2026-11-20' }, window, today),
    ).toBeNull();
  });

  const input = {
    affected: 3,
    backupUserId: null,
    leaveUserId: 'asha',
    emergency: false,
    skip: false,
  };

  it('needs a backup when work is affected', () => {
    expect(checkHandover(input).problem).toBe('backup_needed');
    expect(checkHandover({ ...input, backupUserId: 'ravi' })).toEqual({
      problem: null,
      skipped: false,
    });
    expect(checkHandover({ ...input, affected: 0 })).toEqual({ problem: null, skipped: false });
  });

  it('lets emergency leave skip the handover, flagged', () => {
    expect(checkHandover({ ...input, emergency: true, skip: true })).toEqual({
      problem: null,
      skipped: true,
    });
    expect(checkHandover({ ...input, skip: true }).problem).toBe('backup_needed');
  });

  it('refuses the person as their own backup', () => {
    expect(checkHandover({ ...input, backupUserId: 'asha' }).problem).toBe('backup_is_self');
  });
});

describe('project bonuses', () => {
  const people = [
    { userId: 'a', shares: 2 },
    { userId: 'b', shares: 1 },
  ];

  it('checks the amount, the people and their shares', () => {
    expect(checkBonus({ totalPaise: 300_000, people })).toBeNull();
    expect(checkBonus({ totalPaise: 0, people })).toBe('amount');
    expect(checkBonus({ totalPaise: MAX_BONUS_PAISE + 1, people })).toBe('amount');
    expect(checkBonus({ totalPaise: 300_000, people: [] })).toBe('nobody');
    expect(checkBonus({ totalPaise: 300_000, people: [{ userId: 'a', shares: 0 }] })).toBe(
      'shares',
    );
    expect(checkBonus({ totalPaise: 300_000, people: [people[0], people[0]] as never })).toBe(
      'duplicate',
    );
    expect(checkBonus({ totalPaise: 150, people })).toBe('too_small');
  });

  it('splits by shares in whole rupees that add up exactly', () => {
    expect(splitBonus(300_000, people)).toEqual([
      { userId: 'a', amountPaise: 200_000 },
      { userId: 'b', amountPaise: 100_000 },
    ]);
    const three = splitBonus(100_050, [
      { userId: 'a', shares: 1 },
      { userId: 'b', shares: 1 },
      { userId: 'c', shares: 1 },
    ]);
    expect(three.map((share) => share.amountPaise)).toEqual([33_400 + 50, 33_300, 33_300]);
    expect(three.reduce((sum, share) => sum + share.amountPaise, 0)).toBe(100_050);
  });

  it('books a balanced cost and what is owed to the employee', () => {
    const lines = employeeBonusPosting({ amountPaise: 250_000 });
    expect(isBalanced(lines)).toBe(true);
    expect(lines.map((line) => line.account)).toEqual(['5060', '2030']);
  });
});

describe('achievements', () => {
  it('counts an on-time streak, skipping work made late by others', () => {
    expect(
      onTimeStreak([
        { onTime: true, lateOnOthers: false },
        { onTime: false, lateOnOthers: true },
        { onTime: true, lateOnOthers: false },
        { onTime: false, lateOnOthers: false },
        { onTime: true, lateOnOthers: false },
      ]),
    ).toBe(2);
  });

  it('marks what is earned and how far the rest have come', () => {
    const list = achievementsFrom({
      onTimeStreak: 6,
      onTimeTotal: 12,
      fiveStars: 1,
      recognitions: 0,
      pointsTotal: 640,
    });
    const byKey = new Map(list.map((item) => [item.key, item]));
    expect(byKey.get('on_time_streak')?.earned).toBe(true);
    expect(byKey.get('on_time_25')).toMatchObject({ earned: false, current: 12, target: 25 });
    expect(byKey.get('five_star')?.earned).toBe(true);
    expect(byKey.get('five_star_5')?.earned).toBe(false);
    expect(byKey.get('recognised')?.earned).toBe(false);
    expect(byKey.get('points_500')).toMatchObject({ earned: true, current: 500 });
  });
});
