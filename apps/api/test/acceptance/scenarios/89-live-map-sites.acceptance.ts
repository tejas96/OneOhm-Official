import type { LiveSites } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pinAndSchedule } from '../support/auto-visits';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { entryOf, liveTeam } from '../support/live-map';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { sellProject } from '../support/sales';
import { taskByKey } from '../support/tasks';
import { ensureTeam } from '../support/team';
import { indiaDate } from '../support/travel';

// Duty Day step 4, the sites layer and the reporting line: today's customer sites of the
// manager's people with their status (planned, late, in progress, done), never cached; and a
// manager who no longer looks after someone loses them from the map and their route.
type Status = LiveSites['sites'][number]['status'];
const STATUSES: Status[] = ['planned', 'late', 'in_progress', 'done'];

describe('Live map sites and access', () => {
  let admin: Session;
  let manager: OwnPerson;
  let other: OwnPerson;
  let moved: OwnPerson;
  const workers: OwnPerson[] = [];
  const tasks: Partial<Record<Status, string>> = {};

  beforeAll(async () => {
    admin = await Session.admin();
    await ensureTeam(admin);
    manager = await ownPerson(admin, 'Sites Manager (test)', ['sales']);
    other = await ownPerson(admin, 'Sites Other Manager (test)', ['sales']);
    moved = await ownPerson(admin, 'Sites Moved (test)', ['sales']);
    await admin.patch(`/people/${moved.id}`, { reportsToUserId: manager.id });
    const today = indiaDate();
    for (const [index, status] of STATUSES.entries()) {
      const worker = await ownPerson(admin, `Sites ${status} (test)`, ['execution']);
      workers.push(worker);
      await admin.patch(`/people/${worker.id}`, { reportsToUserId: manager.id });
      const sale = await sellProject(admin, { name: `Live site ${status} (test)` });
      const taskId = taskByKey(sale.project, 'site_survey').id;
      tasks[status] = taskId;
      await admin.post(`/tasks/${taskId}/assign`, { userId: worker.id });
      const pin = { latitude: 16.85 + index * 0.01, longitude: 74.58 };
      await pinAndSchedule(sale.project.id, taskId, pin, today);
      const visit = (open: boolean) =>
        rows(
          `INSERT INTO site_visits (user_id, task_id, project_id, property_id, kind, work_date, check_in_at, check_out_at)
           SELECT $1, t.id, p.id, p.property_id, 'survey', $3, now() - interval '30 minutes', ${open ? 'NULL' : 'now()'}
             FROM project_tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $2`,
          [worker.id, taskId, today],
        );
      if (status === 'late')
        await rows(
          `INSERT INTO visits (kind, status, customer_id, project_id, task_id, day, slot, start_min, end_min, proposed_by)
           SELECT 'survey', 'confirmed', p.customer_id, p.id, t.id, $2, 'morning', 0, 60, 'staff'
             FROM project_tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
          [taskId, today],
        );
      if (status === 'in_progress') await visit(true);
      if (status === 'done') await visit(false);
    }
  });
  afterAll(async () => {
    await rows('UPDATE site_visits SET check_out_at = now() WHERE user_id = ANY($1)', [
      workers.map((worker) => worker.id),
    ]);
    await retire(admin, [manager, other, moved, ...workers]);
    await closeDb();
  });

  it('gives each site of today its status, its people, and no cache', async () => {
    const asManager = await Session.code(manager.phone);
    const reply = await asManager.raw<LiveSites>('GET', '/live/sites');
    expect(reply.status).toBe(200);
    expect(reply.headers.get('cache-control')).toBe('private, no-store');
    for (const [index, status] of STATUSES.entries()) {
      const site = reply.body.sites.find((row) => row.id === tasks[status]);
      expect(site, status).toMatchObject({ status, kind: 'survey' });
      expect(site?.assigneeIds).toContain(workers[index]?.id);
    }
    expect(reply.body.sites.find((row) => row.id === tasks.late)?.plannedStartMin).toBe(0);
  });

  it('shows an open visit at a site as the current visit', async () => {
    const asManager = await Session.code(manager.phone);
    const entry = await entryOf(asManager, workers[2] as OwnPerson);
    expect(entry?.state).toBe('off_duty');
    expect(entry?.today.currentVisit).not.toBeNull();
  });

  it('takes a person off the old manager’s map and route when the line moves', async () => {
    const asManager = await Session.code(manager.phone);
    expect(await entryOf(asManager, moved)).toBeDefined();
    await admin.patch(`/people/${moved.id}`, { reportsToUserId: other.id });
    expect(await entryOf(asManager, moved)).toBeUndefined();
    const route = await asManager.raw('GET', `/people/${moved.id}/duty-route?date=${indiaDate()}`);
    expect(route.status).toBe(403);
    const asOther = await Session.code(other.phone);
    expect((await liveTeam(asOther)).status).toBe(200);
    expect(await entryOf(asOther, moved)).toBeDefined();
  });
});
