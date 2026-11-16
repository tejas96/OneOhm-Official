import { beforeEach, describe, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({ readVisits: vi.fn() }));
const ended = vi.hoisted(() => ({ oneVisitRecord: vi.fn() }));
const alerts = vi.hoisted(() => ({ alertVisitOwner: vi.fn() }));
vi.mock('./site-visit-read', () => reads);
vi.mock('./site-visit-end', () => ended);
// What the reason does to the customer's "Was this visit done?" is tested in visit-news.
vi.mock('../visit-news/visit-news-send', () => ({ afterLeaveReason: vi.fn(), safely: vi.fn() }));
vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  ...alerts,
}));

import { giveLeaveReason } from './site-visit-leave';
import { actor, harness, open } from './site-visit-test-kit';

const closed = {
  ...open,
  checkOutAt: new Date('2026-11-16T07:00:00Z'),
  checkOutSource: 'auto_fence',
  leaveReason: null,
};
const found = (row: Record<string, unknown>) => [
  {
    row,
    record: { taskTitle: 'Panel installation', projectCode: 'P-1', siteLabel: 'Sharma home' },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  ended.oneVisitRecord.mockResolvedValue({ id: 'v1' });
});

describe('the reason for leaving before the job is done', () => {
  it("is kept and tells the task's project manager, never the other crew", async () => {
    reads.readVisits.mockResolvedValue(found(closed));
    const h = harness();
    // The task is not complete; the planned visit has two people on its crew.
    h.selects.push(
      [{ status: 'in_progress' }],
      [{ id: 'planned-1', kind: 'installation', crewUserIds: ['u1', 'lead'] }],
    );
    await giveLeaveReason(h.db as never, actor('u1'), 'v1', 'need_material');
    expect(h.updated[0]).toMatchObject({ leaveReason: 'need_material' });
    const [, visit, notice] = alerts.alertVisitOwner.mock.calls[0] ?? [];
    expect(visit).toMatchObject({ taskId: 't1', projectId: 'p1', crewUserIds: [] });
    expect(notice).toMatchObject({
      kind: 'site_visit_left_unfinished',
      key: 'site_visit_left:v1',
      body: expect.stringContaining('Needs material'),
    });
  });

  it("tells a service request's crew lead, not the person who left", async () => {
    reads.readVisits.mockResolvedValue(
      found({ ...closed, taskId: null, serviceRequestId: 'sr1', projectId: null }),
    );
    const h = harness();
    h.selects.push(
      [{ status: 'in_progress' }],
      [{ id: 'planned-1', kind: 'service', crewUserIds: ['u1', 'lead'] }],
    );
    await giveLeaveReason(h.db as never, actor('u1'), 'v1', 'customer_not_home');
    const [, visit] = alerts.alertVisitOwner.mock.calls[0] ?? [];
    expect(visit).toMatchObject({
      serviceRequestId: 'sr1',
      projectId: null,
      crewUserIds: ['lead'],
    });
  });

  it('is refused the second time', async () => {
    reads.readVisits.mockResolvedValue(found({ ...closed, leaveReason: 'need_material' }));
    await expect(
      giveLeaveReason(harness().db as never, actor('u1'), 'v1', 'come_back_later'),
    ).rejects.toMatchObject({ status: 409, code: 'reason_given' });
    expect(alerts.alertVisitOwner).not.toHaveBeenCalled();
  });

  it('is only for a visit the person, the fence or the route ended', async () => {
    for (const source of ['force_close', 'day_end', 'task_complete', null]) {
      reads.readVisits.mockResolvedValue(found({ ...closed, checkOutSource: source }));
      await expect(
        giveLeaveReason(harness().db as never, actor('u1'), 'v1', 'need_material'),
      ).rejects.toMatchObject({ status: 409, code: 'not_explainable' });
    }
    reads.readVisits.mockResolvedValue(found({ ...closed, checkOutSource: 'manual' }));
    const h = harness();
    h.selects.push([{ status: 'in_progress' }], []);
    await giveLeaveReason(h.db as never, actor('u1'), 'v1', 'need_material');
    expect(alerts.alertVisitOwner).toHaveBeenCalledOnce();
  });

  it('is only for the person who made the visit', async () => {
    reads.readVisits.mockResolvedValue(found(closed));
    await expect(
      giveLeaveReason(harness().db as never, actor('other'), 'v1', 'need_material'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('is only for a closed visit', async () => {
    reads.readVisits.mockResolvedValue(found(open));
    await expect(
      giveLeaveReason(harness().db as never, actor('u1'), 'v1', 'need_material'),
    ).rejects.toMatchObject({ status: 409, code: 'still_open' });
  });

  it('is refused once the task is complete or handed in for review', async () => {
    for (const status of ['completed', 'in_review']) {
      reads.readVisits.mockResolvedValue(found(closed));
      const h = harness();
      h.selects.push([{ status }]);
      await expect(
        giveLeaveReason(h.db as never, actor('u1'), 'v1', 'need_material'),
      ).rejects.toMatchObject({ status: 409, code: 'job_done' });
    }
    expect(alerts.alertVisitOwner).not.toHaveBeenCalled();
  });
});
