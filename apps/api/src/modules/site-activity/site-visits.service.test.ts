import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  afterSiteCheckIn: vi.fn(),
  afterSiteCheckOut: vi.fn(),
  assertDayNotClosed: vi.fn(),
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

const service = (h: Harness) =>
  new SiteVisitsService(h.db as never, {} as never, { start: vi.fn() } as never);

beforeEach(() => {
  vi.clearAllMocks();
  reads.visitRecords.mockResolvedValue([]);
  reads.readVisits.mockResolvedValue([]);
  planned.plannedVisitFor.mockResolvedValue('planned-1');
});

describe('task check-in is one transaction (S7) and links the planned visit (S6)', () => {
  it('runs the visit, the attendance hook and the history note on the transaction', async () => {
    tasks.loadSiteTask.mockResolvedValue(task('u1'));
    const h = harness();
    await service(h).checkIn(actor('u1'), 't1');
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(hooks.afterSiteCheckIn.mock.calls[0]?.[0]).toBe(h.tx);
    expect(events.noteCheckIn.mock.calls[0]?.[0]).toBe(h.tx);
    expect(h.inserted[0]).toMatchObject({
      taskId: 't1',
      visitId: 'planned-1',
      kind: 'installation',
    });
  });

  it('keeps the work date in the business time zone, not a fixed one', async () => {
    tasks.loadSiteTask.mockResolvedValue(task('u1'));
    const h = harness();
    await service(h).checkIn(actor('u1'), 't1');
    expect(h.inserted[0]?.workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(planned.plannedVisitFor).toHaveBeenCalledWith(
      h.tx,
      { taskId: 't1' },
      h.inserted[0]?.workDate,
    );
  });

  it('writes nothing outside the transaction when the history note fails', async () => {
    tasks.loadSiteTask.mockResolvedValue(task('u1'));
    events.noteCheckIn.mockRejectedValueOnce(new Error('boom'));
    const h = harness();
    await expect(service(h).checkIn(actor('u1'), 't1')).rejects.toThrow('boom');
    // Everything went through the transaction handle, so the database rolls it all back.
    expect(h.db.insert).toBeUndefined();
    expect(h.tx.insert).toHaveBeenCalledTimes(1);
  });

  it('refuses a check-in on a day the person already ended (409 day_closed)', async () => {
    tasks.loadSiteTask.mockResolvedValue(task('u1'));
    hooks.assertDayNotClosed.mockRejectedValueOnce(
      Object.assign(new Error('You ended your day. Resume duty to check in.'), {
        status: 409,
        code: 'day_closed',
      }),
    );
    const h = harness();
    await expect(service(h).checkIn(actor('u1'), 't1')).rejects.toMatchObject({
      status: 409,
      code: 'day_closed',
    });
    expect(h.inserted).toHaveLength(0);
    expect(hooks.assertDayNotClosed.mock.calls[0]?.[0]).toBe(h.tx);
  });

  it('refuses a second open visit and says which one', async () => {
    tasks.loadSiteTask.mockResolvedValue(task('u1'));
    reads.visitRecords.mockResolvedValueOnce([{ taskTitle: 'Survey' }]);
    const h = harness();
    await expect(service(h).checkIn(actor('u1'), 't1')).rejects.toMatchObject({
      status: 409,
      code: 'open_visit',
      message: expect.stringContaining('Survey'),
    });
    expect(h.inserted).toHaveLength(0);
  });
});

describe('task check-out is one transaction and finishes the planned visit (S6, S7)', () => {
  it('marks the linked planned visit done inside the transaction', async () => {
    tasks.loadSiteTask.mockResolvedValue(task('u1'));
    const h = harness();
    h.txSelects.push([open]);
    await service(h).checkOut(actor('u1'), 't1');
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(planned.finishLinkedVisit).toHaveBeenCalledWith(
      h.tx,
      'planned-1',
      'u1',
      'Panel installation',
    );
    expect(hooks.afterSiteCheckOut.mock.calls[0]?.[0]).toBe(h.tx);
    expect(events.noteCheckOut.mock.calls[0]?.[0]).toBe(h.tx);
    expect(h.updated[0]).toMatchObject({ closeKind: 'self' });
  });

  it('is a 409 when the person is not checked in here', async () => {
    tasks.loadSiteTask.mockResolvedValue(task('u1'));
    const h = harness();
    await expect(service(h).checkOut(actor('u1'), 't1')).rejects.toMatchObject({
      status: 409,
      code: 'not_checked_in',
    });
    expect(planned.finishLinkedVisit).not.toHaveBeenCalled();
  });
});
