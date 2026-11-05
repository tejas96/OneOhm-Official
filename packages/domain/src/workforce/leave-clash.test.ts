import { describe, expect, it } from 'vitest';
import { leaveApproverProblem, leaveClashes, onLeaveOn } from './leave-clash';

describe('leave clashes and who may approve', () => {
  const leave = (
    id: string,
    userId: string,
    backupUserId: string | null,
    fromDate: string,
    toDate: string,
    status = 'approved',
  ) => ({ id, userId, backupUserId, fromDate, toDate, status });
  // Admin is off 2-6 Nov with Asha covering; Asha is off 4-5 Nov (sick) and 17 Nov.
  const all = [
    leave('a', 'admin', 'asha', '2026-11-02', '2026-11-06'),
    leave('b', 'asha', null, '2026-11-04', '2026-11-05'),
    leave('c', 'admin', 'asha', '2026-11-16', '2026-11-18'),
    leave('d', 'asha', null, '2026-11-17', '2026-11-17'),
    leave('e', 'asha', null, '2026-11-09', '2026-11-10', 'cancelled'),
  ];

  it('warns when the backup is away on some of the days', () => {
    const clashes = leaveClashes(all[0] as (typeof all)[number], all);
    expect(clashes.backupAway.map((item) => item.id)).toEqual(['b']);
    expect(clashes.covering).toEqual([]);
  });

  it('warns the person asking that they are covering someone', () => {
    const sick = leaveClashes(
      { userId: 'asha', backupUserId: null, fromDate: '2026-11-04', toDate: '2026-11-05' },
      all,
    );
    expect(sick.covering.map((item) => item.id)).toEqual(['a']);
  });

  it('ignores leave that is cancelled or on other days', () => {
    const far = leaveClashes(
      { userId: 'asha', backupUserId: 'admin', fromDate: '2026-11-09', toDate: '2026-11-10' },
      all,
    );
    expect(far).toEqual({ backupAway: [], covering: [] });
  });

  it('blocks the person themselves and the backup from approving', () => {
    const base = { applicantId: 'admin', backupUserId: 'asha', seniors: [] as string[] };
    const rule = (approverId: string, extra = {}) =>
      leaveApproverProblem({ ...base, approverId, applicantIsSuperAdmin: false, ...extra });
    expect(rule('admin')).toBe('own');
    expect(rule('asha')).toBe('backup');
    expect(rule('priya')).toBeNull();
  });

  it('sends a Super Admin leave to other Super Admins or the manager when there are any', () => {
    const base = {
      applicantId: 'admin',
      backupUserId: 'asha',
      applicantIsSuperAdmin: true,
    };
    expect(leaveApproverProblem({ ...base, approverId: 'priya', seniors: ['boss'] })).toBe(
      'seniors_only',
    );
    expect(leaveApproverProblem({ ...base, approverId: 'boss', seniors: ['boss'] })).toBeNull();
    // The backup is never a way round the rule.
    expect(leaveApproverProblem({ ...base, approverId: 'asha', seniors: ['boss'] })).toBe('backup');
    // Nobody senior is left (only the applicant and the backup): anyone but the backup.
    expect(
      leaveApproverProblem({ ...base, approverId: 'priya', seniors: ['admin', 'asha'] }),
    ).toBeNull();
    expect(leaveApproverProblem({ ...base, approverId: 'priya', seniors: [] })).toBeNull();
  });
});

describe('on leave on a day', () => {
  const ranges = [{ fromDate: '2026-11-04', toDate: '2026-11-05' }];
  it('is inclusive of both ends and false outside', () => {
    expect(onLeaveOn(ranges, '2026-11-05')).toBe(true);
    expect(onLeaveOn(ranges, '2026-11-06')).toBe(false);
    expect(onLeaveOn([], '2026-11-05')).toBe(false);
  });
});
