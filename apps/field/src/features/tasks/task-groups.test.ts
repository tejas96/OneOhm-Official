import type { ProjectTask } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { groupOf, groupTasks, onTimeShare, TASK_GROUPS } from './task-groups';

function task(overrides: Partial<ProjectTask>): ProjectTask {
  return {
    id: 'b6a4f1d2-0000-4000-8000-000000000001',
    projectId: 'b6a4f1d2-0000-4000-8000-000000000002',
    projectCode: 'OH-2026-001',
    projectName: 'Project',
    templateKey: 'site_survey',
    title: 'Site survey',
    stage: 'survey',
    roleKey: 'execution',
    assignee: null,
    proposedAssignee: null,
    outsideTeam: false,
    status: 'ready',
    waitingParty: 'internal',
    startDate: '2026-11-01',
    dueDate: '2026-11-03',
    overdue: false,
    customerVisible: false,
    approval: false,
    description: null,
    reviewer: 'approvers',
    reviewerIds: [],
    returned: null,
    reworkCount: 0,
    evidence: [],
    captures: [],
    captureFields: [],
    measurements: [],
    knownFacts: {},
    checklist: [],
    blockedBy: [],
    changeBlockers: [],
    blocking: [],
    blockers: [],
    priority: 'none',
    prioritySetBy: null,
    unlocksPayment: false,
    blocksUrgent: false,
    completedAt: null,
    attachments: [],
    missingEvidence: [],
    ...overrides,
  };
}

const TODAY = '2026-11-03';

describe('groupOf', () => {
  it('puts work held by others in waiting, even when late', () => {
    expect(groupOf(task({ status: 'waiting', waitingParty: 'discom', overdue: true }), TODAY)).toBe(
      'waiting',
    );
  });

  it('shows waiting on the OneOhm team as help asked, apart from waiting on others', () => {
    expect(
      groupOf(task({ status: 'waiting', waitingParty: 'internal', dueDate: '2026-11-01' }), TODAY),
    ).toBe('help');
  });

  it('puts work sent back for correction first, even when late', () => {
    const returned = { note: 'Retake the earthing photo', by: null, at: '2026-11-02T10:00:00Z' };
    expect(groupOf(task({ status: 'in_progress', returned, overdue: true }), TODAY)).toBe(
      'returned',
    );
  });

  it('sorts by due date', () => {
    expect(groupOf(task({ dueDate: TODAY }), TODAY)).toBe('today');
    expect(groupOf(task({ dueDate: '2026-11-09' }), TODAY)).toBe('upcoming');
    expect(groupOf(task({ status: 'in_review' }), TODAY)).toBe('review');
  });
});

describe('onTimeShare', () => {
  it('is the share of own work that is not overdue', () => {
    const groups = groupTasks(
      [task({ dueDate: '2026-11-01' }), task({ dueDate: TODAY }), task({ dueDate: '2026-11-08' })],
      TODAY,
    );
    expect(onTimeShare(groups)).toBeCloseTo(2 / 3);
  });

  it('counts late help requests and returned work as late', () => {
    const returned = { note: 'Fix', by: null, at: '2026-11-02T10:00:00Z' };
    const groups = groupTasks(
      [
        task({ status: 'waiting', waitingParty: 'internal', overdue: true }),
        task({ status: 'in_progress', returned }),
      ],
      TODAY,
    );
    expect(onTimeShare(groups)).toBeCloseTo(1 / 2);
  });

  it('is full with nothing assigned', () => {
    expect(onTimeShare(groupTasks([], TODAY))).toBe(1);
  });
});

describe('do-next order', () => {
  it('orders the overdue group by the do-next rule', () => {
    const groups = groupTasks(
      [
        task({ id: 'plain', overdue: true, dueDate: '2026-10-20' }),
        task({ id: 'high', overdue: true, dueDate: '2026-10-30', priority: 'high' }),
      ],
      TODAY,
    );
    expect(groups.overdue.map((entry) => entry.id)).toEqual(['high', 'plain']);
  });
});

describe('do first', () => {
  it('lifts a startable urgent task above overdue work', () => {
    const groups = groupTasks(
      [
        task({ id: 'late', overdue: true, dueDate: '2026-10-20' }),
        task({ id: 'urgent', dueDate: '2026-11-09', priority: 'urgent' }),
      ],
      TODAY,
    );
    expect(groups.first.map((entry) => entry.id)).toEqual(['urgent']);
    expect(TASK_GROUPS[0]).toBe('first');
  });
});
