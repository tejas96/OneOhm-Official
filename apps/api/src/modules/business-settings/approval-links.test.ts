import { APPROVAL_KINDS } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { approvalHref } from './approval-links';

describe('approvalHref', () => {
  it.each(APPROVAL_KINDS)('opens the %s itself, not just its list', (kind) => {
    const href = approvalHref({ kind, id: 'item-1', projectId: null });
    expect(href).toContain('item-1');
  });

  it('opens a task inside its project when it has one', () => {
    expect(approvalHref({ kind: 'task_review', id: 't1', projectId: 'p1' })).toBe(
      '/projects/p1?tab=tasks&task=t1',
    );
  });
});
