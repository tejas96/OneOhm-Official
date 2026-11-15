import type { DutySiteRecord, SiteVisit, TaskSite } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AWAY,
  minutesAgo,
  onDuty,
  pinAndSchedule,
  pointAt,
  SITE,
  sendPoints,
  visitRows,
} from '../support/auto-visits';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { project, taskByKey } from '../support/tasks';
import { indiaDate, inLocationHours } from '../support/travel';

// Duty Day step 3: site visits that nobody taps. Three route points over five minutes inside a
// site's fence check the person in (and start the task); a drive-past does not; points leaving
// check them out; the reason for leaving unfinished reaches the project manager, once; with
// automatic visits off, or at a site with no work, nothing happens. (87-duty-day-auto-site-rules:
// leaving first, fake and late events, planned visits and finishing; -silent: no customer message.)
describe('Duty Day: automatic site visits', () => {
  let admin: Session;
  let sale: Sale;
  let worker: OwnPerson;
  let stranger: OwnPerson;
  let bystander: OwnPerson;
  let me: Session;
  let them: Session;
  let by: Session;
  let taskId = '';
  let savedPolicy: { policy: Record<string, unknown> };

  const putTravel = (patch: Record<string, unknown>) =>
    admin.put('/settings/workforce', {
      ...savedPolicy.policy,
      travel: { ...(savedPolicy.policy.travel as Record<string, unknown>), ...patch },
    });
  const send = sendPoints;
  const taskStatus = async () =>
    (await rows<{ status: string }>('SELECT status FROM project_tasks WHERE id = $1', [taskId]))[0]
      ?.status;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Auto Site Customer (test)' });
    savedPolicy = await admin.get<{ policy: Record<string, unknown> }>('/settings/workforce');
    expect(savedPolicy.policy.travel).toMatchObject({ autoSiteVisits: true, siteFenceM: 150 });
    worker = await ownPerson(admin, 'Auto Site Worker (test)');
    stranger = await ownPerson(admin, 'Auto Site Stranger (test)');
    bystander = await ownPerson(admin, 'Auto Site Bystander (test)');
    taskId = taskByKey(sale.project, 'site_survey').id;
    await admin.post(`/tasks/${taskId}/assign`, { userId: worker.id });
    // The customer's site has a saved pin, and the survey is scheduled today.
    await pinAndSchedule(sale.project.id, taskId, SITE, indiaDate());
    me = await Session.code(worker.phone);
    them = await Session.code(stranger.phone);
    by = await Session.code(bystander.phone);
    await onDuty(me, worker);
    await onDuty(by, bystander);
  });
  afterAll(async () => {
    await admin.put('/settings/workforce', savedPolicy.policy);
    await retire(admin, [worker, stranger, bystander].filter(Boolean));
    await closeDb();
  });

  it('lists the sites with work today and a saved pin, with the fence radius', async () => {
    const sites = await me.get<DutySiteRecord[]>('/me/duty-sites');
    expect(sites).toEqual([
      expect.objectContaining({ id: taskId, kind: 'survey', radiusM: 150, ...SITE }),
    ]);
    // Nobody else has work there.
    expect(await by.get<DutySiteRecord[]>('/me/duty-sites')).toEqual([]);
  });

  it('1: a drive-past (two points four minutes apart) checks nobody in', async () => {
    expect(await taskStatus()).not.toBe('in_progress');
    await inLocationHours(admin, async () => {
      await send(me, [pointAt(90, SITE), pointAt(86, SITE), pointAt(84, AWAY)]);
    });
    expect(await visitRows(worker.id)).toHaveLength(0);
    expect(await taskStatus()).not.toBe('in_progress');
  });

  it('1: three route points over five minutes check the person in and start the task', async () => {
    await inLocationHours(admin, async () => {
      const sent = await send(me, [pointAt(80, SITE), pointAt(77, SITE), pointAt(74, SITE)]);
      expect(sent.body.accepted).toBe(3);
    });
    const [visit, ...rest] = await visitRows(worker.id);
    expect(rest).toHaveLength(0);
    expect(visit).toMatchObject({ check_in_source: 'auto_route', check_out_at: null });
    // At the first inside point, not when the upload arrived, and marked as a late arrival.
    expect(Math.abs((visit?.check_in_at.getTime() ?? 0) - minutesAgo(80).getTime())).toBeLessThan(
      2000,
    );
    expect(visit?.delayed).toBe(true);
    expect(await taskStatus()).toBe('in_progress');
    // The task's start counts from the check-in time.
    const [started] = await rows<{ started_at: Date }>(
      'SELECT started_at FROM project_tasks WHERE id = $1',
      [taskId],
    );
    expect(started?.started_at.getTime()).toBe(visit?.check_in_at.getTime());
    const [note] = await rows<{ message: string }>(
      "SELECT message FROM project_activities WHERE task_id = $1 AND kind = 'task_started'",
      [taskId],
    );
    expect(note?.message).toContain('automatically');
    const open = await me.get<{ visit: SiteVisit | null }>('/me/open-visit');
    expect(open.visit).toMatchObject({ checkInSource: 'auto_route', taskId });
    const seen = await admin.get<SiteVisit[]>(`/projects/${sale.project.id}/site-visits`);
    expect(seen[0]).toMatchObject({ checkInSource: 'auto_route', checkOutSource: null });
  });

  it('is the same on a repeat: another inside point makes no second visit', async () => {
    await send(me, [pointAt(71, SITE)]);
    expect(await visitRows(worker.id)).toHaveLength(1);
  });

  it('2: points leaving the fence check the person out, and the task stays open', async () => {
    await send(me, [pointAt(50, AWAY), pointAt(44, AWAY)]);
    const [visit] = await visitRows(worker.id);
    expect(visit).toMatchObject({ check_out_source: 'auto_route' });
    expect(Math.abs((visit?.check_out_at?.getTime() ?? 0) - minutesAgo(50).getTime())).toBeLessThan(
      2000,
    );
    expect(await taskStatus()).toBe('in_progress');
    const site = await me.get<TaskSite>(`/tasks/${taskId}/site`);
    expect(site.openVisit).toBeNull();
    expect(site.justLeft).toMatchObject({ visitId: visit?.id, done: false, reasonGiven: false });
  });

  it('3: the reason for leaving unfinished reaches the project manager, from the owner only, once', async () => {
    const [visit] = await visitRows(worker.id);
    const asOther = await them.raw('POST', `/site-visits/${visit?.id}/leave-reason`, {
      reason: 'need_material',
    });
    expect(asOther.status).toBe(404);
    const bad = await me.raw('POST', `/site-visits/${visit?.id}/leave-reason`, { reason: 'bored' });
    expect(bad.status).toBe(400);
    const saved = await me.post<SiteVisit>(`/site-visits/${visit?.id}/leave-reason`, {
      reason: 'need_material',
    });
    expect(saved).toMatchObject({ leaveReason: 'need_material', checkOutSource: 'auto_route' });
    expect(saved.leaveReasonAt).not.toBeNull();
    const [manager] = await rows<{ manager_user_id: string }>(
      'SELECT manager_user_id FROM projects WHERE id = $1',
      [sale.project.id],
    );
    const alerts = await rows<{
      user_id: string;
      body: string;
      subject_type: string;
      subject_id: string;
    }>(
      "SELECT user_id, body, subject_type, subject_id FROM notifications WHERE kind = 'site_visit_left_unfinished'",
    );
    expect(alerts).toHaveLength(1);
    // The project's manager is told, with the task to open.
    expect(alerts[0]).toMatchObject({
      user_id: manager?.manager_user_id,
      subject_type: 'task',
      subject_id: taskId,
    });
    expect(alerts[0]?.body).toContain('Needs material');
    // Saying it again is refused, and the manager is not told twice.
    const again = await me.raw<{ code?: string }>(
      'POST',
      `/site-visits/${visit?.id}/leave-reason`,
      {
        reason: 'come_back_later',
      },
    );
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('reason_given');
    expect(
      await rows("SELECT 1 FROM notifications WHERE kind = 'site_visit_left_unfinished'"),
    ).toHaveLength(1);
    const history = await rows(
      "SELECT 1 FROM project_activities WHERE task_id = $1 AND kind = 'site_leave_reason'",
      [taskId],
    );
    expect(history).toHaveLength(1);
    expect((await project(admin, sale.project.id)).id).toBe(sale.project.id);
  });

  it('4: points near a site where the person has no work do nothing', async () => {
    await send(by, [pointAt(90, SITE), pointAt(84, SITE), pointAt(78, SITE), pointAt(72, SITE)]);
    expect(await visitRows(bystander.id)).toHaveLength(0);
  });

  it('5: with automatic visits off, points inside the fence check nobody in', async () => {
    await putTravel({ autoSiteVisits: false });
    expect(await me.get<DutySiteRecord[]>('/me/duty-sites')).toEqual([]);
    await inLocationHours(admin, () =>
      send(me, [pointAt(30, SITE), pointAt(27, SITE), pointAt(24, SITE)]),
    );
    expect(await visitRows(worker.id)).toHaveLength(1);
  });
});
