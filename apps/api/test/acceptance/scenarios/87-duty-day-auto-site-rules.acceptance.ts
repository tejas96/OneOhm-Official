import type { SiteVisit, TaskSite } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  fenceBody,
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
import { project, surveyFacts, taskByKey, workTask } from '../support/tasks';
import { indiaDate, inLocationHours } from '../support/travel';

// Duty Day step 3, the rules around an automatic visit: the route joins the person's planned
// visit; a person who checked out by hand and has not left cannot be checked in again; a fake
// location and an event over two hours old are refused; finishing the task closes every open
// visit on it (the whole crew) and leaves nothing to explain.
describe('Duty Day: automatic site visit rules', () => {
  let admin: Session;
  let sale: Sale;
  let worker: OwnPerson;
  let mate: OwnPerson;
  let me: Session;
  let taskId = '';
  let plannedId = '';

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Auto Rules Customer (test)' });
    worker = await ownPerson(admin, 'Auto Rules Worker (test)');
    mate = await ownPerson(admin, 'Auto Rules Mate (test)');
    taskId = taskByKey(sale.project, 'site_survey').id;
    await admin.post(`/tasks/${taskId}/assign`, { userId: worker.id });
    await pinAndSchedule(sale.project.id, taskId, SITE, indiaDate());
    me = await Session.code(worker.phone);
    await onDuty(me, worker);
  });
  afterAll(async () => {
    await retire(admin, [worker, mate].filter(Boolean));
    await closeDb();
  });

  it('1: the route check-in joins the confirmed visit booked for the task today', async () => {
    const [planned] = await rows<{ id: string }>(
      `INSERT INTO visits (kind, status, customer_id, project_id, task_id, property_id, day, slot,
         start_min, end_min, crew_user_ids, proposed_by)
       SELECT 'survey', 'confirmed', p.customer_id, p.id, $2, p.property_id, $3::date, 'morning',
         600, 660, ARRAY[$4::uuid], 'staff'
         FROM projects p WHERE p.id = $1 RETURNING id`,
      [sale.project.id, taskId, indiaDate(), worker.id],
    );
    plannedId = planned?.id ?? '';
    await inLocationHours(admin, () =>
      sendPoints(me, [pointAt(40, SITE), pointAt(37, SITE), pointAt(34, SITE)]),
    );
    const [visit] = await visitRows(me.userId);
    expect(visit).toMatchObject({ check_in_source: 'auto_route', check_out_at: null });
    expect(visit?.visit_id).toBe(plannedId);
    expect(Math.abs((visit?.check_in_at.getTime() ?? 0) - minutesAgo(40).getTime())).toBeLessThan(
      2000,
    );
  });

  it('2: checking out by hand, then re-entering without leaving makes no new visit', async () => {
    const out = await me.post<TaskSite>(`/tasks/${taskId}/site/check-out`, {});
    expect(out.openVisit).toBeNull();
    expect((await visitRows(me.userId))[0]?.check_out_source).toBe('manual');
    // The phone's fence fires again at once: nothing new, and the answer says why.
    const again = await me.post<TaskSite>(`/tasks/${taskId}/site/check-in`, fenceBody(SITE));
    expect(again.autoSkipped).toBe('must_leave_first');
    expect(again.openVisit).toBeNull();
    expect(await visitRows(me.userId)).toHaveLength(1);
    const [visit] = await rows<{ status: string }>('SELECT status FROM visits WHERE id = $1', [
      plannedId,
    ]);
    expect(visit?.status).toBe('done');
  });

  it('3: a fake location, or an event over two hours old, is refused', async () => {
    const check = (patch: Record<string, unknown>) =>
      me.raw<{ code?: string }>('POST', `/tasks/${taskId}/site/check-in`, fenceBody(SITE, patch));
    const fake = await check({ mocked: true });
    expect([fake.status, fake.body.code]).toEqual([422, 'mocked_location']);
    const old = await check({ tappedAt: minutesAgo(130).toISOString() });
    expect([old.status, old.body.code]).toEqual([422, 'auto_event_too_old']);
    expect(await visitRows(me.userId)).toHaveLength(1);
  });

  it('4: finishing the task closes every open visit on it, and nothing is left to explain', async () => {
    // Checked in by hand again, and a crew mate has an open visit on the same task.
    await me.post<TaskSite>(`/tasks/${taskId}/site/check-in`, { position: SITE });
    await rows(
      `INSERT INTO site_visits (user_id, task_id, project_id, property_id, kind, work_date, check_in_at)
       SELECT $2::uuid, $1::uuid, project_id, (SELECT property_id FROM projects WHERE id = project_id),
              'survey', $3::date, now() - interval '10 minutes'
         FROM project_tasks WHERE id = $1`,
      [taskId, mate.id, indiaDate()],
    );
    const task = taskByKey(await project(admin, sale.project.id), 'site_survey');
    await workTask(admin, task, { as: me, facts: await surveyFacts(admin, sale.project, task) });
    const mine = (await visitRows(me.userId)).at(-1);
    expect(mine).toMatchObject({ check_out_source: 'task_complete', check_in_source: 'manual' });
    expect(mine?.check_out_at?.getTime()).toBeGreaterThanOrEqual(mine?.check_in_at.getTime() ?? 0);
    expect((await visitRows(mate.id))[0]).toMatchObject({ check_out_source: 'task_complete' });
    expect((await me.get<{ visit: SiteVisit | null }>('/me/open-visit')).visit).toBeNull();
    // A visit the task's finish closed has nothing to explain, and neither has an earlier one.
    const reason = (id: string | undefined) =>
      me.raw<{ code?: string }>('POST', `/site-visits/${id}/leave-reason`, {
        reason: 'need_material',
      });
    const finished = await reason(mine?.id);
    expect([finished.status, finished.body.code]).toEqual([409, 'not_explainable']);
    const earlier = await reason((await visitRows(me.userId))[0]?.id);
    expect([earlier.status, earlier.body.code]).toEqual([409, 'job_done']);
  });
});
