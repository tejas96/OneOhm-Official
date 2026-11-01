import type { Capability } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { canViewTask, type TaskViewer } from './task-access';

const viewer = (
  kind: TaskViewer['kind'],
  capabilities: readonly Capability[] = [],
  userId = 'me',
): TaskViewer => ({ userId, kind, capabilities: new Set(capabilities) });

describe('canViewTask', () => {
  it('lets the assignee open their own task', () => {
    expect(canViewTask(viewer('staff'), { assigneeUserId: 'me' })).toBe(true);
    expect(canViewTask(viewer('partner'), { assigneeUserId: 'me' })).toBe(true);
  });

  it('lets approvers and people who see every project open any task', () => {
    expect(canViewTask(viewer('staff', ['tasks.approve']), { assigneeUserId: 'other' })).toBe(true);
    expect(canViewTask(viewer('staff', ['projects.view_all']), { assigneeUserId: null })).toBe(
      true,
    );
  });

  it('keeps everyone else to their own work', () => {
    expect(canViewTask(viewer('staff', ['tasks.complete']), { assigneeUserId: 'other' })).toBe(
      false,
    );
    expect(canViewTask(viewer('reseller'), { assigneeUserId: null })).toBe(false);
  });

  it('never shows a partner crew another crew’s task, even with a broad role', () => {
    expect(
      canViewTask(viewer('partner', ['tasks.approve', 'projects.view_all']), {
        assigneeUserId: 'other',
      }),
    ).toBe(false);
  });
});
