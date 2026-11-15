import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  afterSiteCheckIn: vi.fn(),
  afterSiteCheckOut: vi.fn(),
}));
const events = vi.hoisted(() => ({
  noteCheckIn: vi.fn(),
  noteCheckOut: vi.fn(),
  noteSiteSaved: vi.fn(),
  noteVisitEnded: vi.fn(),
}));
const planned = vi.hoisted(() => ({
  plannedVisitFor: vi.fn(),
  finishLinkedVisit: vi.fn(),
}));
const tasks = vi.hoisted(() => ({ loadSiteTask: vi.fn(), readSiteTask: vi.fn() }));
const reads = vi.hoisted(() => ({ visitRecords: vi.fn(), readVisits: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const notice = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('../workforce/site-hooks', () => hooks);
vi.mock('./site-visit-events', () => events);
vi.mock('./planned-visit', () => planned);
vi.mock('./site-task', () => tasks);
vi.mock('../../common/audit', () => audit);
vi.mock('../workforce/tracking', () => ({
  usableReading: vi.fn(async () => null),
  trackingFor: vi.fn(async () => ({ policy: { travel: { farFromSiteM: 300 } }, status: {} })),
}));
vi.mock('./site-visit-read', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./site-visit-read')>()),
  ...reads,
}));
vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  ...notice,
}));

import { actor, type Harness, harness, open, task } from './site-visit-test-kit';
import { SiteVisitsService } from './site-visits.service';

const service = (h: Harness) => new SiteVisitsService(h.db as never, {} as never);

beforeEach(() => {
  vi.clearAllMocks();
  reads.visitRecords.mockResolvedValue([]);
  reads.readVisits.mockResolvedValue([]);
  planned.plannedVisitFor.mockResolvedValue('planned-1');
});

describe('the owner can always check out by visit id (S1)', () => {
  it('works after the task was handed to someone else', async () => {
    const h = harness();
    h.selects.push([open]);
    tasks.readSiteTask.mockResolvedValue(task('someone-else'));
    h.txSelects.push([open]);
    reads.visitRecords.mockResolvedValue([{ id: 'v1' }]);
    await expect(service(h).checkOutVisit(actor('u1'), 'v1')).resolves.toEqual({ id: 'v1' });
    // The access check that refuses a handed-over task is never used.
    expect(tasks.loadSiteTask).not.toHaveBeenCalled();
    expect(planned.finishLinkedVisit).toHaveBeenCalled();
  });

  it('works when the task was deleted (no task id left on the visit)', async () => {
    const h = harness();
    h.selects.push([{ ...open, taskId: null }], []);
    h.txSelects.push([{ ...open, taskId: null }]);
    reads.visitRecords.mockResolvedValue([{ id: 'v1' }]);
    await service(h).checkOutVisit(actor('u1'), 'v1');
    expect(tasks.readSiteTask).not.toHaveBeenCalled();
    expect(events.noteVisitEnded).toHaveBeenCalledTimes(1);
    expect(h.updated[0]).toMatchObject({ closeKind: 'self' });
  });

  it('treats someone else’s visit as not found, and a closed one as a 409', async () => {
    const other = harness();
    other.selects.push([{ ...open, userId: 'u2' }]);
    await expect(service(other).checkOutVisit(actor('u1'), 'v1')).rejects.toMatchObject({
      status: 404,
    });
    const closed = harness();
    closed.selects.push([{ ...open, checkOutAt: new Date() }]);
    await expect(service(closed).checkOutVisit(actor('u1'), 'v1')).rejects.toMatchObject({
      status: 409,
      code: 'not_checked_in',
    });
  });
});

describe('a manager can force-close with a reason (S1)', () => {
  const found = (patch: Record<string, unknown> = {}) => [
    { visit: { ...open, userId: 'u2', ...patch }, projectManager: 'pm' },
  ];

  it('refuses someone who does not manage the work', async () => {
    const h = harness();
    h.selects.push(found(), []);
    await expect(service(h).forceClose(actor('nobody'), 'v1', 'Stuck')).rejects.toMatchObject({
      status: 403,
    });
    expect(h.updated).toHaveLength(0);
  });

  it('records who closed it and why, and does not mark the planned visit done', async () => {
    const h = harness();
    h.selects.push(found(), []);
    reads.visitRecords.mockResolvedValue([{ id: 'v1' }]);
    await service(h).forceClose(actor('boss', ['projects.manage']), 'v1', 'Task was handed over');
    expect(h.updated[0]).toMatchObject({
      closeKind: 'manager',
      closedByUserId: 'boss',
      closeNote: 'Task was handed over',
    });
    expect(audit.recordAudit).toHaveBeenCalledWith(
      h.tx,
      'boss',
      'site_visit.force_closed',
      'site_visit',
      'v1',
      expect.objectContaining({ reason: 'Task was handed over' }),
    );
    expect(planned.finishLinkedVisit).not.toHaveBeenCalled();
    expect(notice.notify).toHaveBeenCalledTimes(1);
  });

  it('lets the project manager and the person’s own manager close it', async () => {
    const pm = harness();
    pm.selects.push(found(), []);
    reads.visitRecords.mockResolvedValue([{ id: 'v1' }]);
    await expect(service(pm).forceClose(actor('pm'), 'v1', 'Stuck')).resolves.toBeDefined();
    const line = harness();
    line.selects.push(found(), [{ id: 'u2' }]);
    await expect(service(line).forceClose(actor('lead'), 'v1', 'Stuck')).resolves.toBeDefined();
  });

  it('needs service.manage for a service visit, and refuses an already closed one', async () => {
    const wrong = harness();
    wrong.selects.push(found({ serviceRequestId: 'sr', taskId: null }), []);
    await expect(
      service(wrong).forceClose(actor('boss', ['projects.manage']), 'v1', 'Stuck'),
    ).rejects.toMatchObject({ status: 403 });
    const closed = harness();
    closed.selects.push(found({ checkOutAt: new Date() }), []);
    await expect(
      service(closed).forceClose(actor('boss', ['projects.manage']), 'v1', 'Stuck'),
    ).rejects.toMatchObject({ status: 409, code: 'closed' });
  });

  it('never lets the person force-close their own visit', async () => {
    const h = harness();
    h.selects.push(found({ userId: 'boss' }), []);
    await expect(
      service(h).forceClose(actor('boss', ['projects.manage']), 'v1', 'Stuck'),
    ).rejects.toMatchObject({ status: 409, code: 'own' });
  });
});
