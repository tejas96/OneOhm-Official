import type { SiteVisit, TrackView } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { onDuty, pointAt, SITE, sendPoints, visitRows } from '../support/auto-visits';
import { closeDb, outboxFor, rows } from '../support/db';
import { alertsOf, indiaMinutes, plannedVisit, sweep } from '../support/duty-alerts';
import { API, Session } from '../support/http';
import { lastReply } from '../support/onboarding';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { closeChat, lastOf, openChat } from '../support/send';
import { taskByKey } from '../support/tasks';
import { indiaDate, inLocationHours } from '../support/travel';
import { sendInbound } from '../support/whatsapp';

// Duty Day step 6: the customer hears "on the way" (once, only when coming closer and near
// enough), "arrived" at check-in, "Was this visit done?" at a real check-out (not when nobody was
// home, not at the day's end), and "running late" with a missed visit. Their Yes verifies the
// visit; their No makes it doubtful and raises a red alert. STOP, a task that does not message
// its customer, and the policy switch keep it all quiet.
const DEG_PER_M = 1 / 111_195;
const north = (metres: number) => ({ ...SITE, latitude: SITE.latitude + metres * DEG_PER_M });
const at = (minutesAgo: number, metres: number) => pointAt(minutesAgo, north(metres));

describe('Duty Day: customer WhatsApp for site visits', () => {
  let admin: Session;
  let me: Session;
  let worker: OwnPerson;
  let manager: OwnPerson;
  let savedPolicy: { policy: Record<string, unknown> };
  const sales: Record<string, Sale> = {};
  const sale = (key: string) => sales[key] as Sale;
  const taskOf = (key: string) => taskByKey(sale(key).project, 'site_survey').id;
  const phoneOf = (key: string) => sale(key).customer.phone;
  const hours = <T>(work: () => Promise<T>) => inLocationHours(admin, work);
  const sent = async (key: string, template: string) =>
    (await outboxFor(phoneOf(key))).filter(
      (row) => row.template === template || row.dedupe_key.startsWith(`${template}:`),
    );
  const putTravel = (patch: Record<string, unknown>) =>
    admin.put('/settings/workforce', {
      ...savedPolicy.policy,
      travel: { ...(savedPolicy.policy.travel as Record<string, unknown>), ...patch },
    });
  const pin = (key: string, metres: number) =>
    rows(
      `UPDATE properties SET latitude = $2, longitude = $3, location_source = 'gps'
        WHERE id = (SELECT property_id FROM projects WHERE id = $1)`,
      [sale(key).project.id, north(metres).latitude, north(metres).longitude],
    );
  const checkIn = (key: string, metres = 0) =>
    hours(() => me.post(`/tasks/${taskOf(key)}/site/check-in`, { position: north(metres) }));
  const checkOut = (key: string, metres = 0) =>
    hours(() => me.post(`/tasks/${taskOf(key)}/site/check-out`, { position: north(metres) }));
  const lastVisit = async () => (await visitRows(worker.id)).at(-1);
  const reason = async (why: string) =>
    me.post<SiteVisit>(`/site-visits/${(await lastVisit())?.id}/leave-reason`, { reason: why });
  const tapAs = (key: string, id: string) => sendInbound(phoneOf(key), { buttonReply: id });
  const track = async (token: string) => {
    const response = await fetch(`${API}/track/${token}`);
    return { status: response.status, body: (await response.json()) as TrackView };
  };

  beforeAll(async () => {
    admin = await Session.admin();
    savedPolicy = await admin.get<{ policy: Record<string, unknown> }>('/settings/workforce');
    manager = await ownPerson(admin, 'Visit News Manager (test)', ['execution']);
    worker = await ownPerson(admin, 'Ravi Visit News (test)');
    await admin.patch(`/people/${worker.id}`, { reportsToUserId: manager.id });
    for (const key of ['a', 'b', 'c', 'd', 'h', 'late']) {
      sales[key] = await sellProject(admin, { name: `Visit News ${key} (test)` });
      await admin.post(`/tasks/${taskOf(key)}/assign`, { userId: worker.id });
      await rows('UPDATE project_tasks SET notify_customer = true WHERE id = $1', [taskOf(key)]);
      await closeChat(phoneOf(key));
      // Only job A has a pin, so it is the one "on the way" can be about.
      await rows(
        `UPDATE properties SET latitude = null, longitude = null
          WHERE id = (SELECT property_id FROM projects WHERE id = $1)`,
        [sale(key).project.id],
      );
    }
    me = await Session.code(worker.phone);
    await onDuty(me, worker);
    // Job A is today's next job: pinned and planned later today (the others have no pin).
    await rows('UPDATE project_tasks SET start_date = $2, due_date = $2 WHERE id = $1', [
      taskOf('a'),
      indiaDate(),
    ]);
    await plannedVisit(taskOf('a'), worker.id, Math.min(23 * 60, indiaMinutes() + 60));
  });
  afterAll(async () => {
    await putTravel({});
    await retire(admin, [worker, manager]);
    await closeDb();
  });

  let token = '';
  it('1: "on the way" goes once, only when coming closer and 45 min or nearer', async () => {
    // 21 km from the pin and coming closer: too far (about 75 min).
    await pin('a', 0);
    await hours(() => sendPoints(me, [at(8, 22_000), at(6, 21_500), at(4, 21_000)]));
    expect(await sent('a', 'worker_on_way')).toHaveLength(0);
    // The pin behind them: they are moving away.
    await pin('a', 26_000);
    await hours(() => sendPoints(me, [at(3, 20_500)]));
    expect(await sent('a', 'worker_on_way')).toHaveLength(0);
    // The pin ahead, 5 km: coming closer, about 20 min.
    await pin('a', 15_000);
    await hours(() => sendPoints(me, [at(2, 20_000)]));
    const [onWay] = await sent('a', 'worker_on_way');
    expect(onWay?.template).toBe('worker_on_way');
    expect(onWay?.payload).toMatchObject({ worker: 'Ravi', minutes: '20' });
    token = onWay?.payload.trackToken ?? '';
    expect(token.length).toBeGreaterThan(20);
    await hours(() => sendPoints(me, [at(1, 19_500)]));
    expect(await sent('a', 'worker_on_way')).toHaveLength(1);
  });

  it('2: the track link shows the position on the way and none after arrival', async () => {
    const before = await track(token);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ state: 'on_way', workerName: 'Ravi' });
    expect(before.body.worker?.latitude).toBeCloseTo(north(19_500).latitude, 5);
    // 4.5 km straight: 6.3 km of road at 25 km/h is 15.1 min, said as 20.
    expect(before.body.minutes).toBe(20);
    expect((await track(`${token.slice(0, -2)}xx`)).status).toBe(404);
    await checkIn('a', 15_000);
    expect(await sent('a', 'worker_arrived')).toHaveLength(1);
    const after = await track(token);
    expect(after.body).toMatchObject({ state: 'arrived', worker: null, minutes: null });
  });

  it('3: "Was this visit done?" waits for the reason; Yes verifies, a second tap keeps it', async () => {
    await checkOut('a', 15_000);
    // The job is not finished: the check waits in case nobody was home.
    expect(await sent('a', 'visit_check')).toHaveLength(0);
    await reason('come_back_later');
    const [check] = await sent('a', 'visit_check');
    expect(check?.template).toBe('visit_check');
    const visitId = (await lastVisit())?.id ?? '';
    expect(check?.payload).toMatchObject({ yesPayload: `vc:y:${visitId}` });
    await openChat(phoneOf('a'), sale('a').customer.customerId);
    await tapAs('a', `vc:y:${visitId}`);
    expect((await lastReply(phoneOf('a')))?.body).toContain('Thank you');
    await tapAs('a', `vc:n:${visitId}`);
    expect((await lastReply(phoneOf('a')))?.body).toContain('already');
    const [row] = await rows<{ customer_said: string; proof: string }>(
      'SELECT customer_said, proof FROM site_visits WHERE id = $1',
      [visitId],
    );
    expect(row).toMatchObject({ customer_said: 'yes', proof: 'verified' });
    // Another customer's tap on this visit is refused and changes nothing.
    await openChat(phoneOf('b'), sale('b').customer.customerId);
    await tapAs('b', `vc:n:${visitId}`);
    expect((await lastReply(phoneOf('b')))?.body).toContain('could not find');
    expect(await alertsOf(worker.id, 'visit_customer_no')).toHaveLength(0);
    await closeChat(phoneOf('b'));
  });

  it('4: nobody home: no visit check at all', async () => {
    await checkIn('b');
    await checkOut('b');
    await reason('customer_not_home');
    await hours(() => sendPoints(me, [at(0, 19_400)]));
    expect(await sent('b', 'worker_arrived')).toHaveLength(1);
    expect(await sent('b', 'visit_check')).toHaveLength(0);
  });

  it('5: in the open chat the check has buttons; after the wait it goes; No is doubtful and red', async () => {
    await openChat(phoneOf('c'), sale('c').customer.customerId);
    await checkIn('c');
    await checkOut('c');
    const visitId = (await lastVisit())?.id ?? '';
    await rows(
      "UPDATE site_visits SET customer_check_due_at = now() - interval '1 minute' WHERE id = $1",
      [visitId],
    );
    await hours(() => sendPoints(me, [pointAt(0, north(19_300))]));
    const buttons = await lastOf(phoneOf('c'), 'buttons');
    expect(buttons?.buttons?.map((button) => button.id)).toEqual([
      `vc:y:${visitId}`,
      `vc:n:${visitId}`,
    ]);
    await tapAs('c', `vc:n:${visitId}`);
    expect((await lastReply(phoneOf('c')))?.body).toContain('call you');
    const [row] = await rows<{ customer_said: string; proof: string; proof_reasons: string[] }>(
      'SELECT customer_said, proof, proof_reasons FROM site_visits WHERE id = $1',
      [visitId],
    );
    expect(row).toMatchObject({ customer_said: 'no', proof: 'doubtful' });
    expect(row?.proof_reasons).toContain('customer_said_no');
    const [red] = await alertsOf(worker.id, 'visit_customer_no');
    expect(red).toMatchObject({ severity: 'red', subject_id: visitId });
    expect(red?.title).toContain('did not visit');
  });

  it('6: STOP, a task that does not message, and the policy switch keep it quiet', async () => {
    const quiet = async () => {
      await checkIn('h');
      await checkOut('h');
      await reason('customer_not_home');
      expect(await sent('h', 'worker_arrived')).toHaveLength(0);
    };
    await rows('UPDATE customers SET whatsapp_opt_in = false WHERE id = $1', [
      sale('h').customer.customerId,
    ]);
    await quiet();
    await rows('UPDATE customers SET whatsapp_opt_in = true WHERE id = $1', [
      sale('h').customer.customerId,
    ]);
    await rows('UPDATE project_tasks SET notify_customer = false WHERE id = $1', [taskOf('h')]);
    await quiet();
    await rows('UPDATE project_tasks SET notify_customer = true WHERE id = $1', [taskOf('h')]);
    await putTravel({ customerVisitMessages: false });
    await quiet();
    await putTravel({});
    await checkIn('h');
    expect(await sent('h', 'worker_arrived')).toHaveLength(1);
    await checkOut('h');
    await reason('customer_not_home');
  });

  it('7: a missed planned visit tells the customer the team is running late, once', async () => {
    await plannedVisit(taskOf('late'), worker.id, Math.max(0, indiaMinutes() - 60));
    await sweep();
    await sweep();
    const late = await sent('late', 'visit_delayed');
    expect(late).toHaveLength(1);
    expect(late[0]?.payload).toMatchObject({
      customer: expect.any(String),
      home: expect.any(String),
    });
  });

  it('8: a visit closed by the day end asks nothing', async () => {
    await checkIn('d');
    await hours(() => me.post('/attendance/check-out', {}));
    const last = await lastVisit();
    expect(last?.check_out_source).toBe('day_end');
    expect(await sent('d', 'worker_arrived')).toHaveLength(1);
    expect(await sent('d', 'visit_check')).toHaveLength(0);
  });
});
