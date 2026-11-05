import { describe, expect, it } from 'vitest';
import { DEFAULT_APPROVAL_POLICY } from '../settings/approval-policy';
import { approvalOverdue, mayDecide, type PendingApproval, waitingDays } from './approval-kinds';

const item = (patch: Partial<PendingApproval>): PendingApproval => ({
  kind: 'leave',
  id: 'x',
  requestedAt: '2026-11-01T04:00:00Z',
  requestedByUserId: 'asha',
  amountPaise: null,
  ...patch,
});
const manager = { userId: 'ravi', capabilities: ['leave.approve', 'people.manage'] };
const policy = { ...DEFAULT_APPROVAL_POLICY, bonusLimitPaise: 500_000 };

describe('who may decide an approval (PRD 7.1, 7.3)', () => {
  it('needs the right and never lets someone approve their own request', () => {
    expect(mayDecide(item({}), manager, policy)).toBe(true);
    expect(mayDecide(item({ requestedByUserId: 'ravi' }), manager, policy)).toBe(false);
    expect(mayDecide(item({ kind: 'vendor_advance' }), manager, policy)).toBe(false);
  });

  it('keeps an advance the owner recorded in their own list, as they may be its only approver', () => {
    const owner = { userId: 'owner', capabilities: ['finance.approve_payments'] };
    const advance = item({ kind: 'vendor_advance', requestedByUserId: 'owner' });
    expect(mayDecide(advance, owner, policy)).toBe(true);
  });

  it('a request to send a bank transfer is for approvers, never the asker', () => {
    const send = item({ kind: 'bank_payout', requestedByUserId: 'asha', amountPaise: 500_000 });
    const approver = { userId: 'owner', capabilities: ['finance.approve_payments'] };
    expect(mayDecide(send, approver, policy)).toBe(true);
    expect(mayDecide(send, { ...approver, userId: 'asha' }, policy)).toBe(false);
    expect(
      mayDecide(send, { userId: 'ravi', capabilities: ['finance.record_payments'] }, policy),
    ).toBe(false);
  });

  it('task reviews follow the task’s reviewers only', () => {
    const review = item({ kind: 'task_review', reviewerIds: ['meena'] });
    expect(mayDecide(review, manager, policy)).toBe(false);
    expect(mayDecide(review, { userId: 'meena', capabilities: [] }, policy)).toBe(true);
  });

  it('small bonuses go to managers, large ones to payment approvers', () => {
    expect(mayDecide(item({ kind: 'bonus', amountPaise: 400_000 }), manager, policy)).toBe(true);
    expect(mayDecide(item({ kind: 'bonus', amountPaise: 600_000 }), manager, policy)).toBe(false);
    const sharer = item({ kind: 'bonus', amountPaise: 1, excludedUserIds: ['ravi'] });
    expect(mayDecide(sharer, manager, policy)).toBe(false);
  });

  it('counts waiting days and flags approvals waiting too long', () => {
    expect(waitingDays('2026-11-01', '2026-11-04')).toBe(3);
    expect(approvalOverdue('2026-11-01', '2026-11-04', policy)).toBe(false);
    expect(approvalOverdue('2026-11-01', '2026-11-05', policy)).toBe(true);
  });
});

describe('a proposal that names the approver', () => {
  it('stays out of their list', () => {
    const proposal = item({ kind: 'assignee_confirm', requestedByUserId: 'ravi' });
    expect(mayDecide(proposal, { userId: 'ravi', capabilities: ['tasks.assign'] }, policy)).toBe(
      false,
    );
    expect(mayDecide(proposal, { userId: 'meena', capabilities: ['tasks.assign'] }, policy)).toBe(
      true,
    );
  });
});
