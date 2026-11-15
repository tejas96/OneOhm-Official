import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ afterSiteCheckOut: vi.fn() }));
const planned = vi.hoisted(() => ({ finishLinkedVisit: vi.fn() }));
vi.mock('../workforce/site-hooks', () => hooks);
vi.mock('./planned-visit', () => planned);

import { closeVisitsOnTaskDone } from './site-visit-task-done';
import { harness, open } from './site-visit-test-kit';

const task = { id: 't1', title: 'Panel installation', projectId: 'p1' };
const at = new Date('2026-11-16T07:30:00Z');

beforeEach(() => vi.clearAllMocks());

describe('finishing a task ends the open visit on it', () => {
  it('closes at completion time as task_complete and marks the planned visit done', async () => {
    const h = harness();
    h.txSelects.push([open]);
    await closeVisitsOnTaskDone(h.tx as never, task, at);
    expect(h.updated[0]).toMatchObject({
      checkOutAt: at,
      checkOutSource: 'task_complete',
      closeKind: 'self',
    });
    expect(hooks.afterSiteCheckOut).toHaveBeenCalledWith(h.tx, 'u1', 'v1', null);
    expect(planned.finishLinkedVisit).toHaveBeenCalledWith(
      h.tx,
      'planned-1',
      'u1',
      'Panel installation',
    );
    expect(h.inserted[0]).toMatchObject({ kind: 'site_check_out', taskId: 't1' });
  });

  it('never closes before the visit began', async () => {
    const h = harness();
    h.txSelects.push([{ ...open, checkInAt: new Date('2026-11-16T09:00:00Z') }]);
    await closeVisitsOnTaskDone(h.tx as never, task, at);
    expect(h.updated[0]?.checkOutAt).toEqual(new Date('2026-11-16T09:00:00Z'));
  });

  it("closes every crew member's open visit on the task, not only the completer's", async () => {
    const h = harness();
    h.txSelects.push([open, { ...open, id: 'v2', userId: 'u2', visitId: null }]);
    await closeVisitsOnTaskDone(h.tx as never, task, at);
    expect(h.updated).toHaveLength(2);
    expect(hooks.afterSiteCheckOut.mock.calls.map((call) => call[1])).toEqual(['u1', 'u2']);
    expect(h.inserted.map((row) => row.userId)).toEqual(['u1', 'u2']);
  });

  it('does nothing when nobody is checked in', async () => {
    const h = harness();
    await closeVisitsOnTaskDone(h.tx as never, task, at);
    expect(h.updated).toHaveLength(0);
    expect(planned.finishLinkedVisit).not.toHaveBeenCalled();
  });
});
