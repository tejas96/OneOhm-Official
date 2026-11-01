import { describe, expect, it } from 'vitest';
import { firstTimeRightRate, type ReviewPeople, reviewersOf, reviewRoute } from './task-review';

const approvers = ['owner', 'ops'];
const anyApprover: ReviewPeople = { reviewer: 'approvers', managerUserId: 'pm', approvers };
const managerOnly: ReviewPeople = { reviewer: 'project_manager', managerUserId: 'pm', approvers };

describe('reviewRoute', () => {
  it('sends a crew member’s work to everyone who approves tasks', () => {
    expect(reviewRoute(anyApprover, 'crew')).toEqual({
      kind: 'review',
      reviewers: ['owner', 'ops'],
    });
  });

  it('sends an approver’s own work to the other approvers, not back to them', () => {
    expect(reviewRoute(anyApprover, 'owner')).toEqual({ kind: 'review', reviewers: ['ops'] });
  });

  it('lets the only approver sign off their own work', () => {
    expect(reviewRoute({ ...anyApprover, approvers: ['owner'] }, 'owner')).toEqual({
      kind: 'self',
    });
  });

  it('sends work to the project manager when the template says so', () => {
    expect(reviewRoute(managerOnly, 'crew')).toEqual({ kind: 'review', reviewers: ['pm'] });
  });

  it('sends the project manager’s own work to the approvers instead', () => {
    expect(reviewRoute(managerOnly, 'pm')).toEqual({
      kind: 'review',
      reviewers: ['owner', 'ops'],
    });
  });

  it('falls back to the approvers when the project has no manager', () => {
    expect(reviewRoute({ ...managerOnly, managerUserId: null }, 'crew')).toEqual({
      kind: 'review',
      reviewers: ['owner', 'ops'],
    });
  });

  it('keeps work in review when nobody can approve yet', () => {
    expect(reviewRoute({ ...anyApprover, approvers: [] }, 'crew')).toEqual({
      kind: 'review',
      reviewers: [],
    });
  });
});

describe('reviewersOf', () => {
  it('never lists the person who sent the work while someone else can review', () => {
    expect(reviewersOf(anyApprover, 'owner')).toEqual(['ops']);
    expect(reviewersOf(managerOnly, 'crew')).toEqual(['pm']);
  });

  it('uses the designated reviewers for work sent before submitters were kept', () => {
    expect(reviewersOf(managerOnly, null)).toEqual(['pm']);
    expect(reviewersOf(anyApprover, null)).toEqual(['owner', 'ops']);
  });
});

describe('firstTimeRightRate', () => {
  it('is the share of finished tasks never sent back', () => {
    expect(firstTimeRightRate(10, 2)).toBe(0.8);
    expect(firstTimeRightRate(4, 0)).toBe(1);
    expect(firstTimeRightRate(0, 0)).toBeNull();
  });
});
