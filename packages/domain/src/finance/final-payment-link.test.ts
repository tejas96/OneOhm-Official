import { describe, expect, it } from 'vitest';
import {
  FINAL_LINK_WINDOW_DAYS,
  type FinalLinkFacts,
  finalCustomerMilestones,
  finalLinkDecision,
} from './final-payment-link';

const now = new Date('2026-11-01T10:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

const due: FinalLinkFacts = {
  onlinePayments: true,
  payer: 'customer',
  status: 'due',
  dueAt: hoursAgo(1),
  amountPaise: 30_000_00,
  paidPaise: 0,
  final: true,
  linked: false,
};

describe('finalCustomerMilestones', () => {
  it("picks each project's last customer milestone, never the bank's", () => {
    const final = finalCustomerMilestones([
      { id: 'a1', projectId: 'a', payer: 'customer', position: 0 },
      { id: 'a2', projectId: 'a', payer: 'customer', position: 2 },
      { id: 'a3', projectId: 'a', payer: 'bank', position: 3 },
      { id: 'b1', projectId: 'b', payer: 'customer', position: 1 },
      { id: 'c1', projectId: 'c', payer: 'bank', position: 0 },
    ]);
    expect([...final].sort()).toEqual(['a2', 'b1']);
  });
});

describe('finalLinkDecision', () => {
  it('sends the link for what is left when the final milestone falls due', () => {
    expect(finalLinkDecision(due, now)).toEqual({ send: true, amountPaise: 30_000_00 });
  });

  it('asks only for the balance of a part-paid final milestone', () => {
    const decision = finalLinkDecision(
      { ...due, status: 'partly_paid', paidPaise: 10_000_00 },
      now,
    );
    expect(decision).toEqual({ send: true, amountPaise: 20_000_00 });
  });

  it('sends nothing while online payments are off', () => {
    expect(finalLinkDecision({ ...due, onlinePayments: false }, now)).toEqual({
      send: false,
      reason: 'payments_off',
    });
  });

  it('never sends a link for the bank share', () => {
    expect(finalLinkDecision({ ...due, payer: 'bank' }, now)).toEqual({
      send: false,
      reason: 'bank_share',
    });
  });

  it('leaves earlier milestones to finance', () => {
    expect(finalLinkDecision({ ...due, final: false }, now)).toEqual({
      send: false,
      reason: 'not_final',
    });
  });

  it('waits until the milestone is due', () => {
    expect(finalLinkDecision({ ...due, status: 'upcoming', dueAt: null }, now)).toEqual({
      send: false,
      reason: 'not_due',
    });
  });

  it('sends nothing once it is paid', () => {
    expect(finalLinkDecision({ ...due, status: 'paid' }, now)).toEqual({
      send: false,
      reason: 'paid',
    });
    expect(finalLinkDecision({ ...due, status: 'partly_paid', paidPaise: 30_000_00 }, now)).toEqual(
      { send: false, reason: 'paid' },
    );
  });

  it('sends once: any link already made for the milestone stops another', () => {
    expect(finalLinkDecision({ ...due, linked: true }, now)).toEqual({
      send: false,
      reason: 'already_linked',
    });
  });

  it('does not chase dues older than the window', () => {
    const edge = hoursAgo(FINAL_LINK_WINDOW_DAYS * 24);
    expect(finalLinkDecision({ ...due, dueAt: edge }, now).send).toBe(true);
    const old = hoursAgo(FINAL_LINK_WINDOW_DAYS * 24 + 1);
    expect(finalLinkDecision({ ...due, dueAt: old }, now)).toEqual({
      send: false,
      reason: 'too_old',
    });
  });
});
