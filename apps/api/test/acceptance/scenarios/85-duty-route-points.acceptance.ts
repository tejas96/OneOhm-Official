import type { DutyPointsResult, DutyRoute } from '@oneohm/api-contracts';
import { clearExpiredLocations } from '@oneohm/database';
import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { roleIds } from '../support/team';
import { indiaDate } from '../support/travel';

// Duty Day step 1: the route a phone records between check-in and check-out. Points are
// judged one by one (consent, duty window, future, bad fix, duplicate), a late flush is taken
// for 5 minutes after check-out, only the person, their direct manager and people.manage
// holders read the route (a leave approver who is not the manager does not), and the retention sweep deletes old points after saving the day.
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const SANGLI = { latitude: 16.8524, longitude: 74.5815 };
let counter = 0;
const id = () =>
  `00000000-0000-4000-8000-${String(Date.now() % 1e9).padStart(9, '0')}${String(++counter).padStart(3, '0')}`;
const point = (at: string, over: Record<string, unknown> = {}) => ({
  id: id(),
  recordedAt: at,
  ...SANGLI,
  accuracyM: 12,
  speedMps: 4.2,
  headingDeg: 90,
  altitudeM: null,
  mocked: false,
  batteryPercent: 70,
  charging: false,
  network: 'cellular',
  ...over,
});

describe('Duty route points', () => {
  let admin: Session;
  let worker: OwnPerson;
  let manager: OwnPerson;
  let peer: OwnPerson;
  let approver: OwnPerson;
  let approverRole = '';
  let me: Session;
  const date = indiaDate();
  const upload = (who: Session, points: unknown[]) =>
    who.raw<DutyPointsResult>('POST', '/me/duty-points', { points });
  const route = (who: Session, userId: string) =>
    who.raw<DutyRoute>('GET', `/people/${userId}/duty-route?date=${date}`);

  beforeAll(async () => {
    admin = await Session.admin();
    worker = await ownPerson(admin, 'Duty Route Worker (test)', ['sales']);
    manager = await ownPerson(admin, 'Duty Route Manager (test)', ['sales']);
    peer = await ownPerson(admin, 'Duty Route Peer (test)', ['sales']);
    approver = await ownPerson(admin, 'Duty Route Approver (test)', ['sales']);
    const role = await admin.post<{ id: string }>('/roles', {
      name: `Duty Route Approver ${approver.phone} (test)`,
      kind: 'staff',
      capabilities: ['leave.approve', 'people.view'],
    });
    approverRole = role.id;
    await admin.patch(`/people/${approver.id}`, {
      roleIds: [...(await roleIds(admin, ['sales'])), role.id],
    });
    await rows('INSERT INTO reporting_lines (user_id, manager_user_id) VALUES ($1, $2)', [
      worker.id,
      manager.id,
    ]);
    me = await Session.code(worker.phone);
  });
  afterAll(async () => {
    if (approverRole) await admin.patch(`/roles/${approverRole}`, { archived: true });
    await retire(admin, [worker, manager, peer, approver]);
    await closeDb();
  });

  it('turns points away without consent, and refuses a yes to the old words', async () => {
    const early = await upload(me, [point(minutesAgo(5))]);
    expect(early.status).toBe(200);
    expect(early.body).toMatchObject({ accepted: 0, rejected: [{ reason: 'no_consent' }] });
    // Version 2 was the words before the duty route: a yes to them is not taken.
    const old = await me.raw<{ code?: string }>('POST', '/attendance/consent', {
      given: true,
      version: LOCATION_CONSENT_VERSION - 1,
    });
    expect(old.status).toBe(409);
    expect(old.body.code).toBe('consent_text');
    await me.post('/attendance/consent', { given: true, version: LOCATION_CONSENT_VERSION });
  });

  it('takes valid points, rejects the others by id and counts a duplicate as accepted', async () => {
    await me.post('/attendance/check-in', {});
    // Points recorded before the consent was given are turned away, so the consent moves back too.
    await rows(
      "UPDATE location_consents SET consented_at = consented_at - interval '4 hours' WHERE user_id = $1",
      [worker.id],
    );
    // The day began two hours ago, so there is room for points before "now".
    await rows(
      "UPDATE attendance_days SET check_in_at = check_in_at - interval '2 hours' WHERE user_id = $1",
      [worker.id],
    );
    const first = point(minutesAgo(60));
    const valid = [first, point(minutesAgo(30)), point(minutesAgo(10))];
    const outside = point(minutesAgo(180));
    const future = point(new Date(Date.now() + 10 * 60_000).toISOString());
    const bad = point(minutesAgo(20), { latitude: 200 });
    const one = await upload(me, [...valid, outside, future, bad]);
    expect(one.body.accepted).toBe(3);
    expect(one.body.rejected).toEqual(
      expect.arrayContaining([
        { id: outside.id, reason: 'outside_duty' },
        { id: future.id, reason: 'in_future' },
        { id: bad.id, reason: 'bad_coordinates' },
      ]),
    );
    expect(one.body.rejected).toHaveLength(3);
    // The phone sends the first batch again with a new point: the repeat is accepted, stored once.
    const two = await upload(me, [first, point(minutesAgo(5))]);
    expect(two.body).toEqual({ accepted: 2, rejected: [] });
    expect(await rows('SELECT 1 FROM duty_points WHERE user_id = $1', [worker.id])).toHaveLength(4);
  });

  it('shows the route in time order with its summary, to the person, the manager and HR', async () => {
    const mine = await me.get<DutyRoute>(`/me/duty-route?date=${date}`);
    expect(mine.points).toHaveLength(4);
    const times = mine.points.map((item) => item.recordedAt);
    expect(times).toEqual([...times].sort());
    expect(mine.summary).toMatchObject({ count: 4, mockedCount: 0, maxGapMinutes: 30 });
    const asManager = await Session.code(manager.phone);
    expect((await route(asManager, worker.id)).body.summary.count).toBe(4);
    expect((await route(admin, worker.id)).body.summary.count).toBe(4);
  });

  it('refuses a peer, and a leave approver who is not the manager', async () => {
    const asPeer = await Session.code(peer.phone);
    expect((await route(asPeer, worker.id)).status).toBe(403);
    const asApprover = await Session.code(approver.phone);
    expect((await route(asApprover, worker.id)).status).toBe(403);
    // The manager sees their people, not everyone.
    const asManager = await Session.code(manager.phone);
    expect((await route(asManager, peer.id)).status).toBe(403);
  });

  it('takes a late flush for 5 minutes after check-out, and not after', async () => {
    await me.post('/attendance/check-out', {});
    // Ended 10 minutes ago, so both late points are in the past.
    await rows(
      "UPDATE attendance_days SET check_out_at = check_out_at - interval '10 minutes' WHERE user_id = $1",
      [worker.id],
    );
    const [out] = await rows<{ at: Date }>(
      'SELECT check_out_at AS at FROM attendance_days WHERE user_id = $1',
      [worker.id],
    );
    const after = (minutes: number) =>
      new Date((out?.at.getTime() ?? 0) + minutes * 60_000).toISOString();
    const late = point(after(3));
    const tooLate = point(after(6));
    const answer = await upload(me, [late, tooLate]);
    expect(answer.body).toEqual({
      accepted: 1,
      rejected: [{ id: tooLate.id, reason: 'outside_duty' }],
    });
    expect((await me.get<DutyRoute>(`/me/duty-route?date=${date}`)).summary.count).toBe(5);
  });

  it('deletes the points a correction moves outside the day', async () => {
    // Just after midnight the check-in of two hours ago is on the day before: keep it on the day.
    await rows(
      "UPDATE attendance_days SET check_in_at = GREATEST(check_in_at, work_date::timestamp AT TIME ZONE 'Asia/Kolkata') WHERE user_id = $1",
      [worker.id],
    );
    // Check-out corrected to 45 minutes ago: only the point 60 minutes ago is still inside.
    const asked = await me.post<{ id: string }>('/attendance/corrections', {
      workDate: date,
      checkOutAt: minutesAgo(45),
      reason: 'Forgot to end duty on time (test)',
    });
    await admin.post(`/attendance/corrections/${asked.id}/decide`, { approve: true });
    expect((await me.get<DutyRoute>(`/me/duty-route?date=${date}`)).summary.count).toBe(1);
  });

  it('deletes points past the retention days after saving the day, and keeps the saved day', async () => {
    const shift = "interval '200 days'";
    await rows(
      `UPDATE attendance_days SET work_date = work_date - 200, check_in_at = check_in_at - ${shift}, check_out_at = check_out_at - ${shift} WHERE user_id = $1`,
      [worker.id],
    );
    // A day closed before travel was saved at close has no snapshot: the sweep makes it first.
    await rows('DELETE FROM travel_days WHERE user_id = $1', [worker.id]);
    const cleared = await clearExpiredLocations(acceptanceDb().db);
    expect(cleared.dutyPoints).toBeGreaterThanOrEqual(1);
    expect(await rows('SELECT 1 FROM duty_points WHERE user_id = $1', [worker.id])).toHaveLength(0);
    expect(
      await rows<{ source: string }>('SELECT source FROM travel_days WHERE user_id = $1', [
        worker.id,
      ]),
    ).toEqual([{ source: 'backfill' }]);
  });
});
