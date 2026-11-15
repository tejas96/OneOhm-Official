import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AWAY,
  fenceBody,
  minutesAgo,
  onDuty,
  pinAndSchedule,
  SITE,
  visitRows,
} from '../support/auto-visits';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { closeChat } from '../support/send';
import { completeThrough, project, taskByKey } from '../support/tasks';
import { indiaDate } from '../support/travel';

// Duty Day step 3: a visit started by the phone's fence tells the customer nothing (the
// worker's own tap still does), and the task it starts counts from the check-in time.
describe('Duty Day: an automatic start is silent to the customer', () => {
  let admin: Session;
  let sale: Sale;
  let worker: OwnPerson;
  let me: Session;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Auto Silent Customer (test)' });
    worker = await ownPerson(admin, 'Auto Silent Worker (test)');
    me = await Session.code(worker.phone);
    await onDuty(me, worker);
    await closeChat(sale.customer.phone);
  });
  afterAll(async () => {
    await retire(admin, [worker].filter(Boolean));
    await closeDb();
  });

  it('1: a service request started by the fence queues no message; by hand it does', async () => {
    // The customer's site has a pin; the request is the worker's and booked for today.
    await pinAndSchedule(
      sale.project.id,
      taskByKey(sale.project, 'site_survey').id,
      SITE,
      indiaDate(),
    );
    const request = async (visitOn: string | null) => {
      const [made] = await rows<{ id: string }>(
        `INSERT INTO service_requests (customer_id, project_id, category, description, assignee_user_id, visit_on)
         VALUES ($1, $2, 'inverter', 'Silent start (test)', $3, $4) RETURNING id`,
        [sale.customer.customerId, sale.project.id, worker.id, visitOn],
      );
      return made?.id ?? '';
    };
    const told = async (id: string) =>
      (await outboxFor(sale.customer.phone)).filter((row) =>
        row.dedupe_key?.startsWith(`service:${id}:in_progress:`),
      );
    const checkIn = (id: string, body: Record<string, unknown>) =>
      me.raw(`POST`, `/service-visits/${id}/check-in`, body);
    const auto = await request(indiaDate());
    expect(
      (await checkIn(auto, fenceBody(SITE, { tappedAt: minutesAgo(6).toISOString() }))).status,
    ).toBe(200);
    expect((await visitRows(me.userId))[0]).toMatchObject({ check_in_source: 'auto_fence' });
    const [status] = await rows<{ status: string }>(
      'SELECT status FROM service_requests WHERE id = $1',
      [auto],
    );
    expect(status?.status).toBe('in_progress');
    expect(await told(auto)).toHaveLength(0);
    // The same check-in by hand on another request does tell the customer.
    await me.post(`/service-visits/${auto}/check-out`, {});
    const hand = await request(null);
    expect((await checkIn(hand, { position: SITE })).status).toBe(200);
    expect(await told(hand)).toHaveLength(1);
    await me.post(`/service-visits/${hand}/check-out`, {});
  });

  it('2: a task started by the fence queues no message and starts at the check-in time', async () => {
    const second = await sellProject(admin, { name: 'Auto Silent Install (test)' });
    await completeThrough(admin, second.project.id, 'dispatch_material');
    const structure = taskByKey(await project(admin, second.project.id), 'structure_installation');
    await admin.post(`/tasks/${structure.id}/assign`, { userId: worker.id });
    await pinAndSchedule(second.project.id, structure.id, AWAY, indiaDate());
    const arrived = minutesAgo(5);
    await me.post(
      `/tasks/${structure.id}/site/check-in`,
      fenceBody(AWAY, { tappedAt: arrived.toISOString() }),
    );
    const [now] = await rows<{ status: string; started_at: Date; check_in_at: Date }>(
      `SELECT t.status::text AS status, t.started_at, v.check_in_at
         FROM project_tasks t JOIN site_visits v ON v.task_id = t.id WHERE t.id = $1`,
      [structure.id],
    );
    expect(now?.status).toBe('in_progress');
    // The task started at the check-in time (never before the person's last check-out today).
    expect(now?.started_at.getTime()).toBe(now?.check_in_at.getTime());
    expect(now?.check_in_at.getTime()).toBeGreaterThanOrEqual(arrived.getTime() - 2000);
    const sent = (await outboxFor(second.customer.phone)).filter((row) =>
      row.dedupe_key?.startsWith(`task_started:${structure.id}`),
    );
    expect(sent).toHaveLength(0);
  });
});
