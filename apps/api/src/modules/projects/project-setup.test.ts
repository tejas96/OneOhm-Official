import type { GeneratedTask } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { taskValues } from './project-setup';

const task: GeneratedTask = {
  key: 'design',
  title: 'System design',
  description: 'Draw the layout and get it approved.',
  stage: 'design',
  roleKey: 'execution',
  offsetDays: 0,
  durationDays: 2,
  dependsOn: [],
  waitingParty: 'internal',
  customerVisible: true,
  notifyCustomer: false,
  approval: true,
  reviewer: 'project_manager',
  evidence: [],
  captures: [],
  startDate: '2026-11-03',
  dueDate: '2026-11-05',
};

describe('taskValues', () => {
  it('keeps the template description on the new task', () => {
    const row = taskValues('p1', task, 0, { userId: 'u1', outsideTeam: false }, false);
    expect(row.description).toBe('Draw the layout and get it approved.');
  });

  it('keeps who approves the task', () => {
    const row = taskValues('p1', task, 0, { userId: 'u1', outsideTeam: false }, false);
    expect(row.reviewer).toBe('project_manager');
  });
});
