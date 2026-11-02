import { describe, expect, it } from 'vitest';
import { blockedReason, type ProjectStateFacts, projectState } from './project-state';

const base: ProjectStateFacts = {
  status: 'active',
  financiallyClosed: false,
  unpaidBy: null,
  paymentDue: false,
  paymentLate: false,
  blockedBy: null,
  waitingOn: null,
  overdueTasks: 0,
  staleTasks: 0,
  nextDueSoonNotStarted: false,
};

describe('projectState', () => {
  it('is on track when nothing stands out', () => {
    expect(projectState(base)).toEqual({ tone: 'onTrack', label: 'On track' });
  });

  it('closes a paid, completed project and keeps an unpaid one in view', () => {
    expect(projectState({ ...base, status: 'completed', financiallyClosed: true })).toEqual({
      tone: 'done',
      label: 'Closed',
    });
    expect(projectState({ ...base, status: 'completed', unpaidBy: 'customer' })).toEqual({
      tone: 'overdue',
      label: 'Completed — payment outstanding',
    });
    expect(projectState({ ...base, status: 'completed' }).label).toBe('Completed');
  });

  it('says when a switched-on system still has money due', () => {
    expect(projectState({ ...base, status: 'operational', paymentDue: true })).toEqual({
      tone: 'waiting',
      label: 'Operational — payment due',
    });
    expect(projectState({ ...base, status: 'operational', paymentLate: true }).tone).toBe(
      'overdue',
    );
    expect(projectState({ ...base, status: 'operational' }).label).toBe('Operational');
  });

  it('puts a block before late money and late work', () => {
    const blockedBy = { kind: 'dependency', detail: 'x' } as const;
    expect(projectState({ ...base, blockedBy, paymentLate: true, overdueTasks: 2 })).toEqual({
      tone: 'blocked',
      label: 'Blocked — earlier task late',
    });
    expect(
      projectState({ ...base, blockedBy: { kind: 'change_request', detail: 'x' } }).label,
    ).toBe('Blocked — change request');
  });

  it('never shows a wait on the OneOhm team as on track', () => {
    expect(projectState({ ...base, waitingOn: 'internal' })).toEqual({
      tone: 'atRisk',
      label: 'Waiting on our team',
    });
    // The team's own late work shows before an outside wait (owner decision, phase 5).
    expect(projectState({ ...base, waitingOn: 'discom', overdueTasks: 1 }).tone).toBe('overdue');
    expect(projectState({ ...base, waitingOn: 'internal', overdueTasks: 1 }).label).toBe(
      '1 task overdue',
    );
  });
});

describe('projectState: the team before outside waits, and stale work', () => {
  it("shows the team's own late work before an outside wait", () => {
    expect(projectState({ ...base, waitingOn: 'bank', overdueTasks: 3 })).toEqual({
      tone: 'overdue',
      label: '3 tasks overdue',
    });
  });

  it('shows the outside wait when nothing of the team is late', () => {
    expect(projectState({ ...base, waitingOn: 'bank', staleTasks: 2 })).toEqual({
      tone: 'waiting',
      label: 'Waiting on bank',
    });
  });

  it('puts a project with stale work at risk', () => {
    expect(projectState({ ...base, staleTasks: 2 })).toEqual({
      tone: 'atRisk',
      label: 'At risk · 2 tasks with no update',
    });
    expect(projectState({ ...base, staleTasks: 1 }).label).toBe('At risk · 1 task with no update');
  });
});

describe('blockedReason', () => {
  const tasks = [
    { id: 'a', title: 'Net meter', status: 'ready', dueDate: '2026-11-05' },
    { id: 'b', title: 'Subsidy claim', status: 'pending', dueDate: '2026-11-08' },
    { id: 'c', title: 'Handover', status: 'pending', dueDate: '2026-11-20' },
  ];
  const none = new Map<string, readonly string[]>();

  it('names an open change request that holds a task back', () => {
    expect(
      blockedReason({
        today: '2026-11-01',
        tasks,
        dependsOn: none,
        changeRequests: new Map([['b', ['Name change (CR-0003)']]]),
      }),
    ).toEqual({ kind: 'change_request', detail: 'Name change (CR-0003) is open' });
  });

  it('flags a late task that still cannot start because what it needs is unfinished', () => {
    const dependsOn = new Map([
      ['b', ['a']],
      ['c', ['b']],
    ]);
    expect(blockedReason({ today: '2026-11-10', tasks, dependsOn, changeRequests: none })).toEqual({
      kind: 'dependency',
      detail: '“Subsidy claim” needs “Net meter” first',
    });
    expect(
      blockedReason({ today: '2026-11-06', tasks, dependsOn, changeRequests: none }),
    ).toBeNull();
  });
});
