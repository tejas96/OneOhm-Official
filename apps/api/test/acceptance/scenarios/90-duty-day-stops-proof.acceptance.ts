import type { DutyDay, SiteVisit, TaskSite } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { onDuty, pinAndSchedule, pointAt, SITE, sendPoints } from '../support/auto-visits';
import { closeDb, rows } from '../support/db';
import { alertsOf, noticesFor } from '../support/duty-alerts';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { sellProject } from '../support/sales';
import { taskByKey } from '../support/tasks';
import { indiaDate, inLocationHours } from '../support/travel';

// Duty Day step 5, the day itself: stops (an unknown one of 45 min or more is flagged and
// raises `unknown_stop`), visit proof (verified when seen at the site most of a long enough
// visit; doubtful for a short visit or a fake point, with `visit_doubtful` once), and the
// day timeline: stops, travel, visits and gaps in order, totals and replay points.
const north = (metres: number, east = 0) => ({
  latitude: SITE.latitude + metres / 111_195,
  longitude: SITE.longitude + east / 106_500,
});
const FAR = north(3000);
const SITE2 = north(0, 5000);
const every2 = (from: number, to: number, where: { latitude: number; longitude: number }) =>
  Array.from({ length: Math.floor((from - to) / 2) + 1 }, (_, i) => pointAt(from - i * 2, where));

describe('Duty Day: stops, visit proof and the day', () => {
  let admin: Session;
  let manager: OwnPerson;
  let worker: OwnPerson;
  let faker: OwnPerson;
  let stranger: OwnPerson;
  let me: Session;
  let them: Session;
  let taskId = '';
  let fakeTaskId = '';
  const visits: SiteVisit[] = [];

  beforeAll(async () => {
    admin = await Session.admin();
    manager = await ownPerson(admin, 'Day Manager (test)', ['execution']);
    worker = await ownPerson(admin, 'Day Worker (test)', ['sales']);
    faker = await ownPerson(admin, 'Day Faker (test)', ['sales']);
    stranger = await ownPerson(admin, 'Day Stranger (test)', ['sales']);
    for (const person of [worker, faker])
      await admin.patch(`/people/${person.id}`, { reportsToUserId: manager.id });
    for (const [person, pin] of [
      [worker, SITE],
      [faker, SITE2],
    ] as const) {
      const sale = await sellProject(admin, { name: `Day Customer ${person.name}` });
      const id = taskByKey(sale.project, 'site_survey').id;
      await admin.post(`/tasks/${id}/assign`, { userId: person.id });
      await pinAndSchedule(sale.project.id, id, pin, indiaDate());
      if (person === worker) taskId = id;
      else fakeTaskId = id;
    }
    me = await Session.code(worker.phone);
    them = await Session.code(faker.phone);
    await onDuty(me, worker);
    await onDuty(them, faker);
    await inLocationHours(admin, async () => {
      // 150–100 min ago standing at an unknown place 3 km away, the battery running low;
      // silence 100–68 (a gap); a drive; at the site from 62 min ago (the route checks in).
      const stop = every2(150, 100, FAR).map((point) => ({ ...point, batteryPercent: 9 }));
      const drive = [pointAt(68, north(2000)), pointAt(65, north(800))];
      const reply = await sendPoints(me, [...stop, ...drive, ...every2(62, 2, SITE)]);
      expect(reply.status).toBe(200);
      const at = { position: { ...SITE, accuracyM: 10 } };
      // A long visit seen at the site, then a second one tapped in and out at once.
      await me.post<TaskSite>(`/tasks/${taskId}/site/check-out`, at);
      await me.post<TaskSite>(`/tasks/${taskId}/site/check-in`, at);
      await me.post<TaskSite>(`/tasks/${taskId}/site/check-out`, at);
      // At the second site for 30 minutes, one point in the middle from a fake location app.
      const fake = every2(30, 2, SITE2).map((point, index) => ({ ...point, mocked: index === 7 }));
      expect((await sendPoints(them, fake)).status).toBe(200);
      await them.post<TaskSite>(`/tasks/${fakeTaskId}/site/check-out`, {
        position: { ...SITE2, accuracyM: 10 },
      });
    });
    const asManager = await Session.code(manager.phone);
    for (const id of [taskId, fakeTaskId]) {
      const site = await asManager.get<{ visits?: SiteVisit[] }>(`/tasks/${id}/site`);
      visits.push(...(site.visits ?? []));
    }
  });
  afterAll(async () => {
    await retire(admin, [manager, worker, faker, stranger]);
    await closeDb();
  });

  it('verifies a visit seen at the site for most of an hour', async () => {
    const [long] = await rows<{ proof: string; proof_reasons: string[]; check_in_source: string }>(
      `SELECT proof, proof_reasons, check_in_source FROM site_visits
        WHERE user_id = $1 ORDER BY check_in_at LIMIT 1`,
      [worker.id],
    );
    expect(long).toMatchObject({
      proof: 'verified',
      proof_reasons: [],
      check_in_source: 'auto_route',
    });
  });

  it('calls a short visit doubtful, and a visit with a fake point, each alerting once', async () => {
    const [, short] = await rows<{ id: string; proof: string; proof_reasons: string[] }>(
      'SELECT id, proof, proof_reasons FROM site_visits WHERE user_id = $1 ORDER BY check_in_at',
      [worker.id],
    );
    expect(short?.proof).toBe('doubtful');
    expect(short?.proof_reasons).toContain('short_visit');
    const [faked] = await rows<{ id: string; proof: string; proof_reasons: string[] }>(
      'SELECT id, proof, proof_reasons FROM site_visits WHERE user_id = $1',
      [faker.id],
    );
    expect(faked).toMatchObject({ proof: 'doubtful', proof_reasons: ['fake_gps'] });
    const doubtful = await alertsOf(worker.id, 'visit_doubtful');
    expect(doubtful.map((alert) => alert.subject_id)).toEqual([short?.id]);
    const told = await noticesFor(doubtful[0]?.id ?? '');
    expect(told).toEqual([{ user_id: manager.id, kind: 'duty_visit_doubtful' }]);
    expect(await alertsOf(faker.id, 'fake_gps')).toHaveLength(1);
    expect((await alertsOf(faker.id, 'fake_gps'))[0]?.severity).toBe('red');
  });

  it('shows the proof on every site-visit read', async () => {
    expect(visits.length).toBeGreaterThanOrEqual(3);
    for (const visit of visits) {
      expect(['verified', 'doubtful', 'no_proof']).toContain(visit.proof);
      expect(visit.proofAt).not.toBeNull();
    }
  });

  it('flags the unknown stop of 50 minutes, and alerts once', async () => {
    const stops = await alertsOf(worker.id, 'unknown_stop');
    expect(stops).toHaveLength(1);
    expect(stops[0]?.detail.minutes).toBe(50);
    expect(JSON.stringify(stops[0]?.detail)).not.toMatch(/latitude|longitude|16\.8/);
  });

  it('lays the day out as stops, gap, travel and visits, with totals and points', async () => {
    const asManager = await Session.code(manager.phone);
    const day = await asManager.get<DutyDay>(`/people/${worker.id}/day?date=${indiaDate()}`);
    expect(day.duty?.endedAt).toBeNull();
    expect(day.locationOn).toBe(true);
    const kinds = day.segments.map((segment) => segment.kind);
    expect(kinds).toEqual(expect.arrayContaining(['stop', 'gap', 'travel', 'visit']));
    expect(day.segments).toContainEqual(
      expect.objectContaining({ kind: 'stop', place: 'unknown', flagged: true, minutes: 50 }),
    );
    expect(day.segments).toContainEqual(
      expect.objectContaining({ kind: 'gap', reason: 'low_battery' }),
    );
    expect(day.segments).toContainEqual(
      expect.objectContaining({ kind: 'visit', proof: 'verified', open: false }),
    );
    const starts = day.segments.map((segment) => segment.startAt);
    expect([...starts].sort()).toEqual(starts);
    expect(day.totals).toMatchObject({ visits: 2, unknownStopMinutes: 50, paidKm: null });
    expect(day.totals.gapMinutes).toBeGreaterThanOrEqual(30);
    expect(day.totals.routeKm).toBeGreaterThan(2);
    expect(day.points.length).toBeGreaterThan(50);
    expect(day.points.length).toBeLessThanOrEqual(1500);
  });

  it('opens the day to the person and their manager only, and only within retention', async () => {
    expect((await me.raw('GET', `/people/${worker.id}/day`)).status).toBe(200);
    const asStranger = await Session.code(stranger.phone);
    expect((await asStranger.raw('GET', `/people/${worker.id}/day`)).status).toBe(403);
    expect((await me.raw('GET', `/people/${worker.id}/day?date=2020-01-01`)).status).toBe(400);
  });
});
