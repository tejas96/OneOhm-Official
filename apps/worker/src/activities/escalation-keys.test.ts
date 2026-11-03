import { describe, expect, it } from 'vitest';
import { escalationKey } from './escalation-keys';

describe('escalation dedupe keys', () => {
  it('put the recipient in the key, so a new manager is told again', () => {
    expect(escalationKey({ kind: 'late', taskId: 't1', managerUserId: 'm1' })).toBe(
      'escalate:t1:manager:m1',
    );
    expect(escalationKey({ kind: 'late', taskId: 't1', managerUserId: 'm2' })).not.toBe(
      escalationKey({ kind: 'late', taskId: 't1', managerUserId: 'm1' }),
    );
  });

  it('names the holders when nobody manages', () => {
    expect(escalationKey({ kind: 'late', taskId: 't1', managerUserId: null })).toBe(
      'escalate:t1:manager:holders',
    );
    expect(
      escalationKey({ kind: 'stuck', taskId: 't1', since: '2026-01-02', managerUserId: null }),
    ).toBe('stuck:t1:2026-01-02:holders');
    expect(
      escalationKey({ kind: 'stuck', taskId: 't1', since: '2026-01-02', managerUserId: 'm1' }),
    ).toBe('stuck:t1:2026-01-02:m1');
    expect(
      escalationKey({ kind: 'leave-block', taskId: 't1', from: '2026-02-01', managerUserId: 'm1' }),
    ).toBe('leave-block:t1:2026-02-01:m1');
  });
});
