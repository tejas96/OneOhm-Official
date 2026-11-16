import type { DutyPointsResult, TravelClaim } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { dutyDayKit } from '../support/duty-day';
import { COUNT, routePoints } from '../support/duty-route';
import { Session } from '../support/http';
import { retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { STAFF } from '../support/team';
import { indiaDate } from '../support/travel';

// Duty Day step 2: the km come from the recorded route, the claim is made by the system when
// the day ends and waits as pending. The daily job approves a clean day the next morning, as the
// system. A day with a gap, a fake point or a late upload waits for a person, and turning
// automatic approval off in Settings holds everything. Automatic approval is off by default and
// is switched on here.
describe('Duty Day: route km, automatic claim and approval', () => {
  let admin: Session;
  let accounts: Session;
  let sale: Sale;
  const kit = dutyDayKit(
    () => admin,
    () => sale,
  );
  const { workDay, dbClaim, claimOf, morning, putTravel } = kit;

  beforeAll(async () => {
    admin = await Session.admin();
    accounts = await Session.code(STAFF.accounts.phone);
    sale = await sellProject(admin, { name: 'Duty Day Customer (test)' });
    await kit.startPolicy();
  });
  afterAll(async () => {
    await kit.restorePolicy();
    await retire(admin, kit.people);
    await closeDb();
  });

  it('1: a clean day is pending after End duty, and approved by the system the next morning', async () => {
    const { person, me, day } = await workDay('Duty Clean Worker (test)', {});
    expect(day).toMatchObject({ method: 'route', capApplied: false, gapCount: 0, mockedCount: 0 });
    expect(day.paidM).toBe(day.routeM);
    expect(day.routeM).toBeGreaterThan(day.straightM * 0.9);
    expect(day.distanceM).toBe(day.paidM);
    const claims = await me.get<TravelClaim[]>('/me/travel-claims');
    expect(claims).toHaveLength(1);
    const claim = claims[0] as TravelClaim;
    // End duty only makes the claim; nobody has approved it and no bill exists yet.
    expect(claim).toMatchObject({
      status: 'pending',
      autoMade: true,
      autoApproved: false,
      reviewReasons: [],
      method: 'route',
      paidM: day.paidM,
      decidedBy: null,
    });
    expect(claim.project?.id).toBe(sale.project.id);
    expect(claim.amountPaise).toBe(Math.round((day.paidM * claim.ratePaisePerKm) / 1000));
    expect(await dbClaim(person)).toMatchObject({ payable_id: null, status: 'pending' });
    const [ready] = await rows<{ title: string; body: string }>(
      "SELECT title, body FROM notifications WHERE user_id = $1 AND kind = 'travel_claim_ready'",
      [person.id],
    );
    expect(ready?.body).toBe('It will be approved tomorrow morning if everything checks out.');
    expect(ready?.title).toContain('is ready');
    // The job on the same day approves nothing: only earlier days are due.
    await morning(indiaDate());
    expect((await dbClaim(person))?.status).toBe('pending');
    await morning();
    const row = await dbClaim(person);
    expect(row).toMatchObject({
      status: 'approved',
      auto_approved: true,
      decided_by_user_id: null,
      decision_note: 'Approved automatically: clean day',
    });
    const [bill] = await rows<{ status: string; amount_paise: number; party: string }>(
      'SELECT status, amount_paise, party FROM payables WHERE id = $1',
      [row?.payable_id],
    );
    expect(bill).toMatchObject({
      status: 'approved',
      party: 'employee',
      amount_paise: String(claim.amountPaise),
    });
    expect(
      await rows(
        "SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'travel_payable_ready' AND subject_id = $2",
        [accounts.userId, row?.payable_id],
      ),
    ).toHaveLength(1);
    expect(
      await rows(
        "SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'travel_claim_decided'",
        [person.id],
      ),
    ).toHaveLength(1);
    expect(
      await rows(
        "SELECT 1 FROM journal_entries WHERE source_type = 'payable_approved' AND source_id = $1",
        [row?.payable_id],
      ),
    ).not.toHaveLength(0);
    // Running the job again changes nothing: still one bill, one decision.
    await morning();
    expect(await rows('SELECT 1 FROM payables WHERE party_user_id = $1', [person.id])).toHaveLength(
      1,
    );
    expect(
      await rows(
        "SELECT 1 FROM audit_log WHERE action = 'travel_claim.approved' AND entity_id = $1",
        [(await claimOf(person))[0]?.id],
      ),
    ).toHaveLength(1);
  });

  it('2: a 45 minute gap leaves the claim pending with route_gap', async () => {
    const skip = new Set([10, 11, 12, 13, 14, 15, 16, 17]);
    const { person, day } = await workDay('Duty Gap Worker (test)', { skip });
    expect(day).toMatchObject({ method: 'route', gapCount: 1, gapMinutes: 45 });
    const row = await dbClaim(person);
    expect(row).toMatchObject({
      status: 'pending',
      auto_made: true,
      auto_approved: false,
      review_reasons: ['route_gap'],
      payable_id: null,
    });
    expect(
      await rows("SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'travel_claim_sent'", [
        person.id,
      ]),
    ).toHaveLength(1);
    // The manager reads it in plain words: the claim carries the reason code.
    const [seen] = await admin.get<TravelClaim[]>(`/travel-claims?userId=${person.id}`);
    expect(seen).toMatchObject({ status: 'pending', reviewReasons: ['route_gap'], gapMinutes: 45 });
  });

  it('3: a mocked point leaves the claim pending with fake_gps', async () => {
    const { person, day } = await workDay('Duty Fake Worker (test)', { mocked: new Set([5]) });
    expect(day.mockedCount).toBe(1);
    expect(day.method).toBe('route');
    expect((await dbClaim(person))?.review_reasons).toEqual(['fake_gps']);
    expect((await dbClaim(person))?.status).toBe('pending');
  });

  it('4: points that arrive after the day closed update a pending claim, and are audited', async () => {
    const skip = new Set([10, 11, 12, 13, 14, 15, 16, 17]);
    const { person, me } = await workDay('Duty Late Worker (test)', { skip });
    const before = await dbClaim(person);
    expect(before?.status).toBe('pending');
    const late = routePoints({}, skip);
    // The phone flushes the points it held while it had no signal, right after the End duty.
    const sent = await me.raw<DutyPointsResult>('POST', '/me/duty-points', {
      points: late.map((point) => ({ ...point })),
    });
    expect(sent.body.accepted).toBe(late.length);
    const after = await dbClaim(person);
    expect(after?.status).toBe('pending');
    // The gap is closed by the late points, so the reasons are refreshed with the snapshot.
    expect(after?.review_reasons).toBeNull();
    expect(after?.distance_m).toBeGreaterThan(before?.distance_m ?? Number.MAX_SAFE_INTEGER);
    expect(Number(after?.amount_paise)).toBeGreaterThan(
      Number(before?.amount_paise ?? Number.MAX_SAFE_INTEGER),
    );
    const [day] = await rows<{ paid_m: number; gap_count: number; points_count: number }>(
      'SELECT paid_m, gap_count, points_count FROM travel_days WHERE user_id = $1',
      [person.id],
    );
    expect(day).toMatchObject({ paid_m: after?.distance_m, gap_count: 0, points_count: COUNT });
    expect(
      await rows(
        "SELECT 1 FROM audit_log WHERE action = 'travel_claim.refreshed' AND entity_id = $1",
        [(await claimOf(person))[0]?.id],
      ),
    ).toHaveLength(1);
  });

  it('5: with automatic approval off in Settings, even a clean day waits, also in the morning', async () => {
    await putTravel({ autoApprove: false });
    const { person, day } = await workDay('Duty Switch Worker (test)', {});
    expect(day.method).toBe('route');
    expect(await dbClaim(person)).toMatchObject({
      status: 'pending',
      auto_made: true,
      review_reasons: ['auto_approve_off'],
    });
    await morning();
    expect((await dbClaim(person))?.status).toBe('pending');
    // Autoclaim off too: nothing is made for the person.
    await putTravel({ autoApprove: false, autoClaim: false });
    const none = await workDay('Duty Manual Worker (test)', {});
    expect(await claimOf(none.person)).toHaveLength(0);
    expect(none.day.claimable).toBe(true);
    await putTravel({ autoApprove: true, autoClaim: true });
  });
});
