import type { LiveSite, NearestPeople } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { onDuty, pinAndSchedule, pointAt, SITE, sendPoints } from '../support/auto-visits';
import { closeDb, outboxFor, rows } from '../support/db';
import { plannedVisit } from '../support/duty-alerts';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { taskByKey } from '../support/tasks';
import { indiaDate, inLocationHours } from '../support/travel';

// Duty Day step 5, "Send nearest": for a site on the manager's map, the free people they look
// after (on duty, not on a visit, seen in the last 20 minutes), nearest first with an "about"
// ETA; one tap gives the job to one of them through the usual assignment (history, the
// planned visit's crew, the worker's notice) and the customer is not messaged.
const north = (metres: number) => ({
  latitude: SITE.latitude + metres / 111_195,
  longitude: SITE.longitude,
});

describe('Duty Day: send nearest', () => {
  let admin: Session;
  let asManager: Session;
  let sale: Sale;
  let taskId = '';
  const p: Record<string, OwnPerson> = {};
  const person = (key: string) => p[key] as OwnPerson;
  const KEYS = ['owner', 'near', 'far', 'visiting', 'stale', 'ended'];

  beforeAll(async () => {
    admin = await Session.admin();
    p.manager = await ownPerson(admin, 'Nearest Manager (test)', ['execution']);
    p.lonely = await ownPerson(admin, 'Nearest Lonely Manager (test)', ['execution']);
    p.stranger = await ownPerson(admin, 'Nearest Stranger (test)', ['sales']);
    for (const key of KEYS) {
      p[key] = await ownPerson(admin, `Nearest ${key} (test)`, ['sales']);
      await admin.patch(`/people/${person(key).id}`, { reportsToUserId: person('manager').id });
    }
    sale = await sellProject(admin, { name: 'Nearest Customer (test)' });
    taskId = taskByKey(sale.project, 'site_survey').id;
    await admin.post(`/tasks/${taskId}/assign`, { userId: person('owner').id });
    await pinAndSchedule(sale.project.id, taskId, SITE, indiaDate());
    await plannedVisit(taskId, person('owner').id, 0);
    const where: Record<string, { metres: number; minutesAgo: number }> = {
      near: { metres: 600, minutesAgo: 2 },
      far: { metres: 4000, minutesAgo: 3 },
      visiting: { metres: 300, minutesAgo: 2 },
      stale: { metres: 200, minutesAgo: 30 },
      ended: { metres: 100, minutesAgo: 4 },
    };
    for (const [key, at] of Object.entries(where)) {
      const me = await Session.code(person(key).phone);
      await onDuty(me, person(key));
      await inLocationHours(admin, () =>
        sendPoints(me, [pointAt(at.minutesAgo, north(at.metres))]),
      );
      if (key === 'ended') await me.post('/attendance/check-out', {});
    }
    await rows(
      "INSERT INTO site_visits (user_id, kind, work_date, check_in_at) VALUES ($1, 'survey', $2, now() - interval '10 minutes')",
      [person('visiting').id, indiaDate()],
    );
    asManager = await Session.code(person('manager').phone);
  });
  afterAll(async () => {
    await rows('UPDATE site_visits SET check_out_at = now() WHERE user_id = $1', [
      person('visiting').id,
    ]);
    await retire(admin, Object.values(p));
    await closeDb();
  });

  it('lists the free people nearest first, with an "about" ETA', async () => {
    const reply = await asManager.raw<NearestPeople>('GET', `/live/sites/${taskId}/nearest`);
    expect(reply.status).toBe(200);
    expect(reply.body.siteId).toBe(taskId);
    expect(reply.body.people.map((row) => row.person.id)).toEqual([
      person('near').id,
      person('far').id,
    ]);
    const [near, far] = reply.body.people;
    expect(near).toMatchObject({ etaMinutes: 1, etaLabel: 'about 1 min' });
    expect(near?.distanceM).toBeGreaterThan(550);
    expect(far).toMatchObject({ etaMinutes: 10, etaLabel: 'about 10 min' });
  });

  it('refuses a plain worker, and hides a site that is not on the caller’s map', async () => {
    const asStranger = await Session.code(person('stranger').phone);
    expect((await asStranger.raw('GET', `/live/sites/${taskId}/nearest`)).status).toBe(403);
    await admin.patch(`/people/${person('stranger').id}`, {
      reportsToUserId: person('lonely').id,
    });
    const asLonely = await Session.code(person('lonely').phone);
    expect((await asLonely.raw('GET', `/live/sites/${taskId}/nearest`)).status).toBe(404);
    const assign = await asLonely.raw('POST', `/live/sites/${taskId}/assign`, {
      userId: person('stranger').id,
    });
    expect(assign.status).toBe(404);
  });

  it('gives the job to the nearest person the usual way, and tells the customer nothing', async () => {
    const before = await outboxFor(sale.customer.phone);
    const outside = await asManager.raw('POST', `/live/sites/${taskId}/assign`, {
      userId: person('stranger').id,
    });
    expect(outside.status).toBe(400);
    const reply = await asManager.raw<LiveSite>('POST', `/live/sites/${taskId}/assign`, {
      userId: person('near').id,
    });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ id: taskId });
    expect(reply.body.assigneeIds).toContain(person('near').id);
    const [task] = await rows<{ assignee_user_id: string }>(
      'SELECT assignee_user_id FROM project_tasks WHERE id = $1',
      [taskId],
    );
    expect(task?.assignee_user_id).toBe(person('near').id);
    const [visit] = await rows<{ crew_user_ids: string[] }>(
      "SELECT crew_user_ids FROM visits WHERE task_id = $1 AND status = 'confirmed'",
      [taskId],
    );
    expect(visit?.crew_user_ids).toEqual([person('near').id]);
    const audit = await rows(
      "SELECT id FROM audit_log WHERE action = 'task.assigned' AND entity_id = $1 AND actor_user_id = $2",
      [taskId, person('manager').id],
    );
    expect(audit).toHaveLength(1);
    const told = await rows<{ kind: string }>(
      'SELECT kind FROM notifications WHERE user_id = $1 AND subject_id = $2',
      [person('near').id, taskId],
    );
    expect(told.map((row) => row.kind)).toContain('task_assigned');
    expect(await outboxFor(sale.customer.phone)).toEqual(before);
  });
});
