import type { ProjectTask } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { groupOf, groupTasks, onTimeShare } from './task-groups';

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
