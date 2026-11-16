import { describe, expect, it } from 'vitest';
import {
  isHrOrFinance,
  travelClaimReviewers,
  travelDeciderProblem,
  travelVoidProblem,
} from './travel-approval';

const who = (userId: string, ...capabilities: string[]) => ({ userId, capabilities });

describe('who decides a travel claim (S10)', () => {
  const base = { claimantId: 'worker', managerIds: ['boss'] };

  it('lets the reporting manager decide, even without a leave right', () => {
    expect(travelDeciderProblem({ ...base, decider: who('boss') })).toBeNull();
  });

  it('lets whoever covers for the manager decide', () => {
    expect(
      travelDeciderProblem({ ...base, managerIds: ['boss', 'cover'], decider: who('cover') }),
    ).toBeNull();
  });

  it('lets HR and finance decide', () => {
    expect(travelDeciderProblem({ ...base, decider: who('hr', 'people.manage') })).toBeNull();
    expect(
      travelDeciderProblem({ ...base, decider: who('fin', 'finance.record_payments') }),
    ).toBeNull();
    expect(
      travelDeciderProblem({ ...base, decider: who('fin2', 'finance.approve_payments') }),
    ).toBeNull();
  });

  it('refuses a leave approver who is none of those', () => {
    expect(travelDeciderProblem({ ...base, decider: who('peer', 'leave.approve') })).toBe(
      'not_allowed',
    );
  });

  it('refuses the claimant even when they are HR or finance', () => {
    expect(
      travelDeciderProblem({ ...base, decider: who('worker', 'people.manage', 'finance.view') }),
    ).toBe('own');
  });

  it('refuses a person with no manager line and no right', () => {
    expect(travelDeciderProblem({ claimantId: 'a', managerIds: [], decider: who('b') })).toBe(
      'not_allowed',
    );
  });

  it('knows HR and finance rights', () => {
    expect(isHrOrFinance(['finance.view'])).toBe(false);
    expect(isHrOrFinance(['people.manage'])).toBe(true);
  });
});

describe('the approvals list for a claim', () => {
  it('puts the manager first, then HR and finance, without the claimant or repeats', () => {
    expect(
      travelClaimReviewers({
        claimantId: 'worker',
        managerIds: ['boss', 'cover'],
        hrIds: ['hr', 'boss', 'worker'],
        financeIds: ['fin', 'hr'],
      }),
    ).toEqual(['boss', 'cover', 'hr', 'fin']);
  });
});

describe('voiding an approved claim (S9)', () => {
  const ok = {
    status: 'approved',
    payableStatus: 'approved',
    payoutOpen: false,
    reason: 'Wrong day',
  };

  it('allows an approved, unpaid claim with a reason', () => {
    expect(travelVoidProblem(ok)).toBeNull();
  });
  it('needs a reason', () => {
    expect(travelVoidProblem({ ...ok, reason: '   ' })).toBe('reason');
  });
  it('refuses a claim that is not approved', () => {
    expect(travelVoidProblem({ ...ok, status: 'pending' })).toBe('not_approved');
    expect(travelVoidProblem({ ...ok, status: 'cancelled' })).toBe('not_approved');
  });
  it('refuses once paid', () => {
    expect(travelVoidProblem({ ...ok, payableStatus: 'paid' })).toBe('paid');
  });
  it('refuses while a bank transfer is on its way', () => {
    expect(travelVoidProblem({ ...ok, payoutOpen: true })).toBe('payout_open');
  });
});
