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
    status: 'ready',
    waitingParty: 'internal',
    startDate: '2026-11-01',
    dueDate: '2026-11-03',
    overdue: false,
    customerVisible: false,
    approval: false,
    evidence: [],
    captures: [],
    captureFields: [],
    knownFacts: {},
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

  it('keeps internal waiting as the person’s own work', () => {
    expect(
      groupOf(task({ status: 'waiting', waitingParty: 'internal', dueDate: '2026-11-01' }), TODAY),
    ).toBe('overdue');
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

  it('is full with nothing assigned', () => {
    expect(onTimeShare(groupTasks([], TODAY))).toBe(1);
  });
});
