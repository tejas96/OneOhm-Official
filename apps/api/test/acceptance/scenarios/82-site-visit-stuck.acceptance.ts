import type { SiteVisit, TaskSite } from '@oneohm/api-contracts';
import { closeForgottenDays } from '@oneohm/database';
import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { taskByKey } from '../support/tasks';
import { indiaDate, inLocationHours } from '../support/travel';

// Duty Day Step 0, S1: an open site visit can never get stuck. The person checks out by
// the visit's id even after the task was handed over; a manager closes it with a reason
// on record; and End duty closes whatever is still open.
const SITE = { latitude: 16.8524, longitude: 74.5815, accuracyM: 12 };

describe('Stuck site visits', () => {
  let admin: Session;
  let sale: Sale;
  let worker: OwnPerson;
  let other: OwnPerson;
  let me: Session;
  let them: Session;
  let surveyId: string;
  let installId: string;

  const visits = () => admin.get<SiteVisit[]>(`/projects/${sale.project.id}/site-visits`);
  const checkIn = (taskId: string) =>
    inLocationHours(admin, () =>
      me.post<TaskSite>(`/tasks/${taskId}/site/check-in`, { position: SITE }),
    );

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Stuck Visit Customer (test)' });
    surveyId = taskByKey(sale.project, 'site_survey').id;
    installId = taskByKey(sale.project, 'installation_complete').id;
    worker = await ownPerson(admin, 'Stuck Worker (test)');
    other = await ownPerson(admin, 'Stuck Other (test)');
    await admin.post(`/tasks/${surveyId}/assign`, { userId: worker.id });
    await admin.post(`/tasks/${installId}/assign`, { userId: worker.id });
    me = await Session.code(worker.phone);
    them = await Session.code(other.phone);
    await me.post('/attendance/consent', { given: true, version: LOCATION_CONSENT_VERSION });
  });
  afterAll(async () => {
    await retire(admin, [worker, other].filter(Boolean));
    await closeDb();
  });

  it('lets the owner check out by visit id after the task was handed over', async () => {
    const site = await checkIn(surveyId);
    const open = site.openVisit;
    expect(open).not.toBeNull();
    await admin.post(`/tasks/${surveyId}/assign`, { userId: other.id });
    const byTask = await me.raw('POST', `/tasks/${surveyId}/site/check-out`, {});
    expect(byTask.status).toBeGreaterThanOrEqual(400);
    const someoneElse = await them.raw('POST', `/site-visits/${open?.id}/check-out`, {});
    expect(someoneElse.status).toBe(404);
    const closed = await me.post<SiteVisit>(`/site-visits/${open?.id}/check-out`, {});
    expect(closed.checkOutAt).not.toBeNull();
    const again = await me.raw('POST', `/site-visits/${open?.id}/check-out`, {});
    expect(again.status).toBe(409);
  });

  it('lets a manager force-close with a reason, and nobody else', async () => {
    const site = await checkIn(installId);
    const id = site.openVisit?.id;
    const noReason = await admin.raw('POST', `/site-visits/${id}/force-close`, { reason: '' });
    expect(noReason.status).toBe(400);
    const stranger = await them.raw('POST', `/site-visits/${id}/force-close`, { reason: 'Stuck' });
    expect(stranger.status).toBe(403);
    const closed = await admin.post<SiteVisit>(`/site-visits/${id}/force-close`, {
      reason: 'Left the site, forgot to check out',
    });
    expect(closed.closeKind).toBe('manager');
    expect(closed.closeNote).toBe('Left the site, forgot to check out');
    expect(closed.checkOutAt).not.toBeNull();
  });

  it('closes a visit left open when the person ends their day', async () => {
    const site = await checkIn(installId);
    const id = site.openVisit?.id;
    await me.raw('POST', '/attendance/check-in', {});
    await me.post('/attendance/check-out', {});
    const after = (await visits()).find((visit) => visit.id === id);
    expect(after?.checkOutAt).not.toBeNull();
    expect(after?.closeKind).toBe('day_end');
  });

  it('refuses a site check-in on a day the person ended, until they resume duty', async () => {
    const refused = await inLocationHours(admin, () =>
      me.raw<{ code?: string; message?: string }>('POST', `/tasks/${installId}/site/check-in`, {
        position: SITE,
      }),
    );
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('day_closed');
    expect(refused.body.message).toBe('You ended your day. Resume duty to check in.');
    await me.post('/attendance/resume', {});
    const site = await checkIn(installId);
    expect(site.openVisit).not.toBeNull();
  });

  describe('the night job', () => {
    const today = () => indiaDate();
    const job = () => closeForgottenDays(acceptanceDb().db, today(), 'Asia/Kolkata');
    /** Every auto-close notice (to the person or the team) made for that person's days. */
    const noticesFor = (userId: string) =>
      rows<{ id: string }>(
        `select n.id from notifications n join attendance_days d on n.dedupe_key like '%' || d.id || '%'
          where n.kind = 'attendance_auto_closed' and d.user_id = $1 and d.work_date <= current_date - 2`,
        [userId],
      );

    it('closes a visit left open from an earlier day at that day end, even when attendance was closed', async () => {
      // Make it yesterday's: a closed attendance day and a visit still open.
      await rows(
        "update attendance_days set work_date = work_date - 1, check_in_at = check_in_at - interval '1 day', check_out_at = check_in_at - interval '1 day' + interval '1 minute' where user_id = $1",
        [worker.id],
      );
      await rows(
        "update site_visits set work_date = work_date - 1, check_in_at = check_in_at - interval '1 day' where user_id = $1 and check_out_at is null",
        [worker.id],
      );
      const result = await job();
      expect(result.visits).toBeGreaterThanOrEqual(1);
      const [visit] = await rows<{ closed: boolean; before_midnight: boolean; kind: string }>(
        `select check_out_at is not null as closed,
                check_out_at <= (work_date + 1)::timestamp at time zone 'Asia/Kolkata' as before_midnight,
                close_kind as kind
           from site_visits where user_id = $1 and work_date = $2::date - 1 order by check_in_at desc limit 1`,
        [worker.id, today()],
      );
      expect(visit).toEqual({ closed: true, before_midnight: true, kind: 'day_end' });
      // That day's travel is saved again, counting the visit.
      expect(
        await rows('select 1 from travel_days where user_id = $1 and work_date = $2::date - 1', [
          worker.id,
          today(),
        ]),
      ).toHaveLength(1);
    });

    it('announces a recent forgotten day once, closes an old one quietly, and is safe to run again', async () => {
      const day = (offset: number) => `current_date - ${offset}`;
      for (const [who, offset] of [
        [worker.id, 2],
        [other.id, 12],
      ] as const)
        await rows(
          `insert into attendance_days (id, user_id, work_date, check_in_at)
           values (gen_random_uuid(), $1, ${day(offset)}, (${day(offset)} + time '09:30') at time zone 'Asia/Kolkata')`,
          [who],
        );
      await job();
      const closed = await rows<{ user_id: string; auto: boolean }>(
        'select user_id, auto_closed_at is not null as auto from attendance_days where user_id = any($1) and check_out_at is not null and work_date <= current_date - 2',
        [[worker.id, other.id]],
      );
      expect(closed.map((row) => row.user_id).sort()).toEqual([other.id, worker.id].sort());
      expect(closed.every((row) => row.auto)).toBe(true);
      const told = await noticesFor(worker.id);
      expect(told.length).toBeGreaterThanOrEqual(1);
      // Older than 7 days: closed, flagged, nobody told.
      expect(await noticesFor(other.id)).toHaveLength(0);
      const again = await job();
      expect(again.closed + again.quiet).toBe(0);
      expect(await noticesFor(worker.id)).toHaveLength(told.length);
    });
  });

  describe('taps that waited for signal', () => {
    const tapAt = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
    const dayOf = (userId: string) =>
      rows<{ id: string; tap_delayed: boolean; received: Date | null }>(
        'select id, tap_delayed, check_in_received_at as received from attendance_days where user_id = $1 order by work_date desc limit 1',
        [userId],
      );

    it('refuses a tap older than 12 hours or ahead of the server, with 422', async () => {
      const old = await them.raw<{ code?: string }>('POST', '/attendance/check-in', {
        tappedAt: tapAt(13 * 60),
      });
      expect(old.status).toBe(422);
      expect(old.body.code).toBe('tap_too_old');
      const ahead = await them.raw<{ code?: string }>('POST', '/attendance/check-in', {
        tappedAt: tapAt(-10),
      });
      expect(ahead.status).toBe(422);
      expect(ahead.body.code).toBe('tap_in_future');
    });

    it('uses a 30 minute to 12 hour old tap with a flag and one alert for the day', async () => {
      const alertsOf = (dayId: string) =>
        rows<{ id: string }>(
          "select id from notifications where kind = 'attendance_tap_delayed' and dedupe_key like $1",
          [`attendance_tap_delayed:${dayId}%`],
        );
      const checkedIn = await them.raw('POST', '/attendance/check-in', { tappedAt: tapAt(90) });
      expect(checkedIn.status).toBeLessThan(300);
      const [day] = await dayOf(other.id);
      expect(day).toMatchObject({ tap_delayed: true });
      expect(day?.received).not.toBeNull();
      const first = await alertsOf(day?.id ?? '');
      expect(first.length).toBeGreaterThanOrEqual(1);
      // The check-out tap is late too, but the manager hears once for the day.
      const out = await them.raw('POST', '/attendance/check-out', { tappedAt: tapAt(45) });
      expect(out.status).toBeLessThan(300);
      expect(await alertsOf(day?.id ?? '')).toHaveLength(first.length);
    });
  });
});
