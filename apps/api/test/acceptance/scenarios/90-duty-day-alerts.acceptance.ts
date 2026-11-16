import type { DutyAlert, LiveAlerts } from '@oneohm/api-contracts';
import { clearExpiredLocations } from '@oneohm/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { onDuty, pinAndSchedule, pointAt, SITE, sendPoints } from '../support/auto-visits';
import { acceptanceDb, closeDb, rows } from '../support/db';
import {
  alertsOf,
  indiaMinutes,
  noticesFor,
  plannedVisit,
  sweep,
  wholeWorkingDay,
} from '../support/duty-alerts';
import { Session } from '../support/http';
import { entryOf } from '../support/live-map';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { sellProject } from '../support/sales';
import { taskByKey } from '../support/tasks';
import { indiaDate, inLocationHours } from '../support/travel';

// Duty Day step 5, the alert feed: each kind fires once (a second run of the five-minute job,
// or a second upload, adds nothing), tells the person's manager once (finance for an unpaid
// claim), a route gap resolves itself when points come back, and the feed is scoped like the
// live map: a manager sees their own team only, HR everyone, a plain worker is refused.
const KEYS = ['late', 'away', 'gapper', 'faker', 'refuser', 'long', 'missed', 'claimer', 'leaver'];

describe('Duty Day: alerts', () => {
  let admin: Session;
  let asManager: Session;
  const p: Record<string, OwnPerson> = {};
  const person = (key: string) => p[key] as OwnPerson;
  const kindOf = async (key: string, kind: string) => alertsOf(person(key).id, kind);

  beforeAll(async () => {
    admin = await Session.admin();
    p.manager = await ownPerson(admin, 'Alert Manager (test)', ['execution']);
    p.other = await ownPerson(admin, 'Alert Other Manager (test)', ['execution']);
    p.outsider = await ownPerson(admin, 'Alert Outsider (test)', ['sales']);
    p.finance = await ownPerson(admin, 'Alert Finance (test)', ['accounts']);
    for (const key of KEYS) {
      p[key] = await ownPerson(admin, `Alert ${key} (test)`, ['sales']);
      await admin.patch(`/people/${person(key).id}`, { reportsToUserId: person('manager').id });
    }
    await admin.patch(`/people/${person('outsider').id}`, { reportsToUserId: person('other').id });
    await rows(
      "INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status) VALUES ($1, 'casual', $2, $2, 2, 'approved')",
      [person('away').id, indiaDate()],
    );
    asManager = await Session.code(person('manager').phone);
  });
  afterAll(async () => {
    await rows('UPDATE site_visits SET check_out_at = now() WHERE user_id = $1', [
      person('long').id,
    ]);
    await retire(admin, Object.values(p));
    await closeDb();
  });

  it('raises not checked in, once, for nobody on leave', async () => {
    await wholeWorkingDay(admin, async () => {
      await sweep();
      await sweep();
    });
    const late = await kindOf('late', 'not_checked_in');
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ severity: 'amber', subject_type: 'person', day: indiaDate() });
    expect(await noticesFor(late[0]?.id ?? '')).toEqual([
      { user_id: person('manager').id, kind: 'duty_not_checked_in' },
    ]);
    expect(await kindOf('away', 'not_checked_in')).toHaveLength(0);
  });

  it('raises a route gap while the phone is quiet, and resolves it when points return', async () => {
    const me = await Session.code(person('gapper').phone);
    await onDuty(me, person('gapper'));
    // On duty for 50 minutes: five minutes, then 40 quiet ones (amber; red only over an hour).
    await rows(
      "UPDATE attendance_days SET check_in_at = now() - interval '50 minutes' WHERE user_id = $1",
      [person('gapper').id],
    );
    await inLocationHours(admin, () => sendPoints(me, [pointAt(45, SITE), pointAt(40, SITE)]));
    await sweep();
    const [open] = await kindOf('gapper', 'route_gap');
    expect(open).toMatchObject({ severity: 'amber', resolved_at: null });
    expect(Number(open?.detail.minutes)).toBeGreaterThanOrEqual(40);
    await inLocationHours(admin, () => sendPoints(me, [pointAt(0, SITE)]));
    await sweep();
    const after = await kindOf('gapper', 'route_gap');
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ resolved_reason: 'points_resumed' });
    expect(await noticesFor(after[0]?.id ?? '')).toHaveLength(1);
  });

  it('raises fake GPS (red) from a mocked point, and from a refused automatic check-in', async () => {
    const faker = await Session.code(person('faker').phone);
    await onDuty(faker, person('faker'));
    const mocked = { ...pointAt(3, SITE), mocked: true };
    await inLocationHours(admin, () => sendPoints(faker, [pointAt(5, SITE), mocked]));
    await inLocationHours(admin, () => sendPoints(faker, [{ ...pointAt(1, SITE), mocked: true }]));
    expect(await kindOf('faker', 'fake_gps')).toMatchObject([{ severity: 'red' }]);
    const refuser = await Session.code(person('refuser').phone);
    await onDuty(refuser, person('refuser'));
    const sale = await sellProject(admin, { name: 'Alert Refused Customer (test)' });
    const taskId = taskByKey(sale.project, 'site_survey').id;
    await admin.post(`/tasks/${taskId}/assign`, { userId: person('refuser').id });
    await pinAndSchedule(sale.project.id, taskId, SITE, indiaDate());
    const refused = await inLocationHours(admin, () =>
      refuser.raw('POST', `/tasks/${taskId}/site/check-in`, {
        position: { ...SITE, accuracyM: 10 },
        source: 'auto_fence',
        tappedAt: new Date().toISOString(),
        mocked: true,
      }),
    );
    expect(refused.status).toBe(422);
    const [fake] = await kindOf('refuser', 'fake_gps');
    expect(fake).toMatchObject({ severity: 'red', detail: { source: 'site_check_in' } });
  });

  it('raises a visit open over 4 hours, a missed visit, and claims waiting or unpaid', async () => {
    await rows(
      "INSERT INTO site_visits (user_id, kind, work_date, check_in_at) VALUES ($1, 'survey', $2, now() - interval '5 hours')",
      [person('long').id, indiaDate()],
    );
    const sale = await sellProject(admin, { name: 'Alert Missed Customer (test)' });
    const taskId = taskByKey(sale.project, 'site_survey').id;
    await admin.post(`/tasks/${taskId}/assign`, { userId: person('missed').id });
    await plannedVisit(taskId, person('missed').id, Math.max(0, indiaMinutes() - 60));
    const claim = (days: number, status: string, decidedDaysAgo: number | null) =>
      rows(
        `INSERT INTO travel_claims (user_id, work_date, distance_m, rate_paise_per_km, amount_paise,
             legs, visits, status, created_at, decided_at)
         VALUES ($1, current_date - $2::int, 1000, 500, 500, '[]'::jsonb, 1, $3,
                 now() - interval '3 days', now() - make_interval(days => $4::int))`,
        [person('claimer').id, days, status, decidedDaysAgo ?? 3],
      );
    await claim(10, 'pending', null);
    await claim(11, 'approved', 8);
    await sweep();
    await sweep();
    expect(await kindOf('long', 'visit_open_long')).toHaveLength(1);
    const [missed] = await kindOf('missed', 'visit_missed');
    expect(missed).toMatchObject({ severity: 'red', subject_type: 'task', subject_id: taskId });
    expect(missed?.detail).toMatchObject({ siteId: taskId, label: expect.any(String) });
    expect(await kindOf('claimer', 'claim_waiting')).toHaveLength(1);
    const [unpaid] = await kindOf('claimer', 'claim_unpaid');
    const told = await noticesFor(unpaid?.id ?? '');
    expect(told.map((row) => row.user_id)).toContain(person('finance').id);
    expect(told.map((row) => row.user_id)).not.toContain(person('claimer').id);
  });

  it('keeps a job left unfinished in the feed without telling the manager twice', async () => {
    const sale = await sellProject(admin, { name: 'Alert Leaver Customer (test)' });
    const taskId = taskByKey(sale.project, 'site_survey').id;
    await admin.post(`/tasks/${taskId}/assign`, { userId: person('leaver').id });
    const [visit] = await rows<{ id: string }>(
      `INSERT INTO site_visits (user_id, task_id, project_id, kind, work_date, check_in_at, check_out_at, check_out_source, close_kind)
       VALUES ($1, $2, $3, 'survey', $4, now() - interval '40 minutes', now() - interval '5 minutes', 'auto_route', 'self')
       RETURNING id`,
      [person('leaver').id, taskId, sale.project.id, indiaDate()],
    );
    const leaver = await Session.code(person('leaver').phone);
    await leaver.post(`/site-visits/${visit?.id}/leave-reason`, { reason: 'need_material' });
    const [left] = await kindOf('leaver', 'job_left_unfinished');
    expect(left).toMatchObject({ subject_type: 'site_visit', subject_id: visit?.id });
    expect(await noticesFor(left?.id ?? '')).toHaveLength(0);
  });

  it('shows a manager their own team’s open alerts only, with counts on the map', async () => {
    const feed = await asManager.raw<LiveAlerts>('GET', '/live/alerts');
    expect(feed.status).toBe(200);
    const people = new Set(feed.body.alerts.map((alert) => alert.person.id));
    expect(people.has(person('faker').id)).toBe(true);
    expect(people.has(person('outsider').id)).toBe(false);
    expect(feed.body.alerts.some((alert) => alert.kind === 'route_gap')).toBe(false);
    const times = feed.body.alerts.map((alert) => alert.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect((await entryOf(asManager, person('faker')))?.alerts).toMatchObject({ red: 1 });
    const hr = await ownPerson(admin, 'Alert HR (test)', ['hr']);
    p.hr = hr;
    const asHr = await Session.code(hr.phone);
    expect((await asHr.get<LiveAlerts>('/live/alerts')).alerts.length).toBeGreaterThan(0);
    const worker = await Session.code(person('late').phone);
    expect((await worker.raw('GET', '/live/alerts')).status).toBe(403);
  });

  it('marks an alert seen and resolves it, only inside the caller’s scope', async () => {
    const [alert] = await kindOf('long', 'visit_open_long');
    const id = alert?.id ?? '';
    const seen = await asManager.post<DutyAlert>(`/live/alerts/${id}/seen`, {});
    expect(seen.seenBy?.id).toBe(person('manager').id);
    const asOther = await Session.code(person('other').phone);
    expect((await asOther.raw('POST', `/live/alerts/${id}/resolve`, {})).status).toBe(404);
    const done = await asManager.post<DutyAlert>(`/live/alerts/${id}/resolve`, {
      reason: 'Called, he had left',
    });
    expect(done).toMatchObject({ resolvedReason: 'Called, he had left' });
    expect(done.resolvedAt).not.toBeNull();
    expect((await asManager.raw('POST', `/live/alerts/${id}/resolve`, {})).status).toBe(409);
    const feed = await asManager.get<LiveAlerts>('/live/alerts');
    expect(feed.alerts.some((row) => row.id === id)).toBe(false);
  });

  it('deletes alerts past the retention period', async () => {
    await rows(
      `INSERT INTO duty_alerts (kind, person_id, subject_type, subject_id, day, title, severity)
       VALUES ('fake_gps', $1, 'person', $1, current_date - 400, 'Old (test)', 'red')`,
      [person('faker').id],
    );
    await clearExpiredLocations(acceptanceDb().db, indiaDate());
    const old = await rows("SELECT id FROM duty_alerts WHERE title = 'Old (test)'");
    expect(old).toHaveLength(0);
  });
});
