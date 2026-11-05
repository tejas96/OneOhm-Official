import { describe, expect, it } from 'vitest';
import {
  needsSecondPerson,
  secondPersonMet,
  secondPersonMissing,
  secondPersonSetupProblem,
  secondPersonText,
} from './second-person';

const limit = 50_000_00;

describe('needsSecondPerson', () => {
  it('is off at zero and applies only above the limit', () => {
    expect(needsSecondPerson(1_00_000_00, 0)).toBe(false);
    expect(needsSecondPerson(limit, limit)).toBe(false);
    expect(needsSecondPerson(limit + 1, limit)).toBe(true);
  });
});

describe('secondPersonMet', () => {
  it('needs someone other than the sender', () => {
    expect(secondPersonMet({ senderId: 'a', approvedByUserId: 'b', askedByUserId: null })).toBe(
      true,
    );
    expect(secondPersonMet({ senderId: 'a', approvedByUserId: null, askedByUserId: 'c' })).toBe(
      true,
    );
    expect(secondPersonMet({ senderId: 'a', approvedByUserId: 'a', askedByUserId: null })).toBe(
      false,
    );
    expect(secondPersonMet({ senderId: 'a', approvedByUserId: null, askedByUserId: null })).toBe(
      false,
    );
  });
  it('is met by the asker even when the sender approved the bill', () => {
    expect(secondPersonMet({ senderId: 'a', approvedByUserId: 'a', askedByUserId: 'c' })).toBe(
      true,
    );
  });
});

describe('secondPersonMissing', () => {
  const lone = { senderId: 'a', approvedByUserId: 'a', askedByUserId: null };
  it('blocks a lone person above the limit only', () => {
    expect(secondPersonMissing({ ...lone, amountPaise: limit + 1, limitPaise: limit })).toBe(true);
    expect(secondPersonMissing({ ...lone, amountPaise: limit, limitPaise: limit })).toBe(false);
    expect(secondPersonMissing({ ...lone, amountPaise: limit + 1, limitPaise: 0 })).toBe(false);
  });
});

describe('secondPersonText', () => {
  it('names who can help and the limit', () => {
    const text = secondPersonText(limit, ['Ravi', 'Meena'], ['Asha']);
    expect(text).toBe(
      'Above ₹50,000, two people must take part. Ask Ravi, Meena to press Ask to send, or ask Asha to send it.',
    );
  });
  it('falls back to plain words with no names and shortens long lists', () => {
    expect(secondPersonText(limit, [], [])).toContain('another approver');
    expect(secondPersonText(limit, ['A', 'B', 'C', 'D', 'E'], [])).toContain('A, B, C and 2 more');
  });
});

describe('secondPersonSetupProblem', () => {
  const approver = { userId: 'a', canApprove: true, canRecord: true };
  it('refuses a one-person firm', () => {
    expect(secondPersonSetupProblem([approver])).toMatch(/Two people/);
    expect(secondPersonSetupProblem([])).toMatch(/Two people/);
  });
  it('refuses when the only other person can do neither', () => {
    expect(
      secondPersonSetupProblem([approver, { userId: 'b', canApprove: false, canRecord: false }]),
    ).not.toBeNull();
  });
  it('accepts an approver plus a recorder or a second approver', () => {
    expect(
      secondPersonSetupProblem([approver, { userId: 'b', canApprove: false, canRecord: true }]),
    ).toBeNull();
    expect(
      secondPersonSetupProblem([approver, { userId: 'b', canApprove: true, canRecord: false }]),
    ).toBeNull();
  });
  it('does not count only recorders as a sender', () => {
    expect(
      secondPersonSetupProblem([
        { userId: 'a', canApprove: false, canRecord: true },
        { userId: 'b', canApprove: false, canRecord: true },
      ]),
    ).not.toBeNull();
  });
});
