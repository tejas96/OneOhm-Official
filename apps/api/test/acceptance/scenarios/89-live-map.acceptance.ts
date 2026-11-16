import type { LiveSites } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { entryOf, liveTeam, onDuty, point, SANGLI } from '../support/live-map';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { indiaDate } from '../support/travel';

// Duty Day step 4: the manager's live map. HR (people.manage) sees every staff member; a
// manager sees their direct reports and nobody else; a plain worker with no reports is refused
// (403) on both reads. Each person's state comes from today's facts. Off duty, yesterday's
// open day, withdrawn or old consent and location switched off give no position and no km.
describe('Live map', () => {
  let admin: Session;
  let asManager: Session;
  const people: Record<string, OwnPerson> = {};
  const p = (key: string) => people[key] as OwnPerson;
  const reports = [
    'mover',
    'still',
    'quiet',
    'visiting',
    'done',
    'faker',
    'stale',
    'away',
    'withdrawn',
    'oldWords',
    'untracked',
  ];

  beforeAll(async () => {
    admin = await Session.admin();
    people.hr = await ownPerson(admin, 'Live HR (test)', ['hr']);
    people.manager = await ownPerson(admin, 'Live Manager (test)', ['sales']);
    people.stranger = await ownPerson(admin, 'Live Stranger (test)', ['sales']);
    for (const key of reports) {
      people[key] = await ownPerson(admin, `Live ${key} (test)`, ['sales']);
      await admin.patch(`/people/${p(key).id}`, { reportsToUserId: p('manager').id });
    }
    await onDuty(admin, p('mover'), [point(12, 0, 6), point(6, 500, 6), point(1, 1000, 6)]);
    await onDuty(admin, p('still'), [point(10, 0, 0), point(5, 5, 0), point(1, 8, 0)]);
    await onDuty(admin, p('quiet'), [point(40, 0, 0), point(25, 10, 0)]);
    await onDuty(admin, p('visiting'), [point(3, 0, 0)]);
    await rows(
      "INSERT INTO site_visits (user_id, kind, work_date, check_in_at) VALUES ($1, 'survey', $2, now() - interval '15 minutes')",
      [p('visiting').id, indiaDate()],
    );
    const doneMe = await onDuty(admin, p('done'), [point(20, 0, 3)]);
    await doneMe.post('/attendance/check-out', {});
    await onDuty(admin, p('faker'), [point(6, 0, 0), point(1, 2000, 0, true)]);
    await onDuty(admin, p('stale'), [point(5, 0, 0)]);
    // A day that began yesterday and was never ended is not live today.
    await rows(
      "UPDATE attendance_days SET work_date = work_date - 1, check_in_at = check_in_at - interval '20 hours' WHERE user_id = $1",
      [p('stale').id],
    );
    await rows(
      "INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status) VALUES ($1, 'casual', $2, $2, 2, 'approved')",
      [p('away').id, indiaDate()],
    );
    const withdrawn = await onDuty(admin, p('withdrawn'), [point(2, 0, 6)]);
    await withdrawn.post('/attendance/consent', { given: false });
    await onDuty(admin, p('oldWords'), [point(2, 0, 6)]);
    await rows('UPDATE location_consents SET text_version = text_version - 1 WHERE user_id = $1', [
      p('oldWords').id,
    ]);
    await onDuty(admin, p('untracked'), [point(2, 0, 6)]);
    await admin.patch(`/people/${p('untracked').id}`, { tracking: 'off' });
    asManager = await Session.code(p('manager').phone);
  });
  afterAll(async () => {
    await rows('UPDATE site_visits SET check_out_at = now() WHERE user_id = $1', [
      p('visiting').id,
    ]);
    await retire(admin, Object.values(people));
    await closeDb();
  });

  it('shows a manager their direct reports, not a stranger, and is never cached', async () => {
    const me = await asManager.get<{ hasReports?: boolean }>('/auth/me');
    expect(me.hasReports).toBe(true);
    const team = await liveTeam(asManager);
    expect(team.status).toBe(200);
    expect(team.headers.get('cache-control')).toBe('private, no-store');
    expect(team.body.people.map((row) => row.person.id).sort()).toEqual(
      reports.map((key) => p(key).id).sort(),
    );
    expect(team.body.people.find((row) => row.person.id === p('stranger').id)).toBeUndefined();
    expect((await entryOf(asManager, p('mover')))?.person.phone).toBe(p('mover').phone);
  });

  it('works out each state from today', async () => {
    const team = (await liveTeam(asManager)).body;
    const state = (key: string) => team.people.find((row) => row.person.id === p(key).id)?.state;
    expect(state('mover')).toBe('moving');
    expect(state('still')).toBe('idle');
    expect(state('quiet')).toBe('gap');
    expect(state('visiting')).toBe('on_visit');
    expect(state('done')).toBe('off_duty');
    expect(state('away')).toBe('on_leave');
    const moving = await entryOf(asManager, p('mover'));
    expect(moving?.position).toMatchObject({ batteryPercent: 61, network: 'cellular' });
    expect(moving?.tail).toHaveLength(3);
    expect(moving?.today.kmSoFar).toBeCloseTo(1, 1);
    expect((await entryOf(asManager, p('quiet')))?.position).not.toBeNull();
  });

  it('never gives an off-duty person, or yesterday’s open day, a position', async () => {
    for (const key of ['done', 'stale']) {
      const entry = await entryOf(asManager, p(key));
      expect(entry).toMatchObject({ state: 'off_duty', position: null, tail: [] });
      expect(entry?.today.dutyStartedAt).toBeNull();
    }
  });

  it('places nobody at a mocked point, and flags the day', async () => {
    const faker = await entryOf(asManager, p('faker'));
    expect(faker?.position?.latitude).toBeCloseTo(SANGLI.latitude, 4);
    expect(faker?.flags.mockedToday).toBe(true);
    expect(faker?.state).toBe('idle');
  });

  it('reads nothing from the route with consent withdrawn or old, or location off', async () => {
    for (const key of ['withdrawn', 'oldWords', 'untracked']) {
      const entry = await entryOf(asManager, p(key));
      expect(entry).toMatchObject({ state: 'location_off', position: null, tail: [] });
      expect(entry?.today.kmSoFar).toBeNull();
      expect(entry?.flags.mockedToday).toBeNull();
    }
  });

  it('shows HR everyone, and refuses a plain worker (403)', async () => {
    const team = await liveTeam(await Session.code(p('hr').phone));
    expect(team.status).toBe(200);
    for (const key of ['manager', 'mover', 'stranger', 'untracked'])
      expect(team.body.people.some((row) => row.person.id === p(key).id)).toBe(true);
    expect(team.body.people.some((row) => row.person.id === p('hr').id)).toBe(false);
    const asStranger = await Session.code(p('stranger').phone);
    expect((await liveTeam(asStranger)).status).toBe(403);
    const sites = await asStranger.raw<LiveSites>('GET', '/live/sites');
    expect(sites.status).toBe(403);
    expect((await asStranger.get<{ hasReports?: boolean }>('/auth/me')).hasReports).toBe(false);
  });
});
