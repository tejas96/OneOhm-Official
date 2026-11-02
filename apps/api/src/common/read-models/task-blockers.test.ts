import { describe, expect, it } from 'vitest';
import { blockerDetails } from './task-blockers';

const today = '2026-11-02';
const dep = {
  title: 'Site survey',
  status: 'in_progress' as const,
  dueDate: '2026-11-05',
  waitingParty: 'internal' as const,
  assigneeName: 'Ravi',
};

describe('blockerDetails', () => {
  it('counts days late from the due date', () => {
    expect(blockerDetails({ ...dep, dueDate: '2026-10-30' }, today)).toEqual({
      title: 'Site survey',
      assignee: 'Ravi',
      daysLate: 3,
      waitingOn: null,
    });
  });

  it('is zero when not late', () => {
    expect(blockerDetails(dep, today).daysLate).toBe(0);
  });

  it('names the outside party a waiting blocker waits on', () => {
    expect(
      blockerDetails({ ...dep, status: 'waiting', waitingParty: 'bank' }, today).waitingOn,
    ).toBe('bank');
  });

  it('names no party for internal waits', () => {
    expect(
      blockerDetails({ ...dep, status: 'waiting', waitingParty: 'internal' }, today).waitingOn,
    ).toBeNull();
  });
});
