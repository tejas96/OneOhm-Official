import type { TravelClaim } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { dutyDayKit } from '../support/duty-day';
import { Session } from '../support/http';
import { retire } from '../support/people';
import { type Sale, sellProject } from '../support/sales';
import { indiaDate } from '../support/travel';

// Duty Day step 2, the edges: resuming the day withdraws the waiting claim, a claim the person
// makes keeps the day's review reasons, a day with no site visit pays nothing, and an approver
// who saw an older amount is refused.
describe('Duty Day: resume, manual claim, no visit and amount_changed', () => {
  let admin: Session;
  let sale: Sale;
  const kit = dutyDayKit(
    () => admin,
    () => sale,
  );
  const { workDay, dbClaim, claimOf, morning, putTravel } = kit;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Duty Day Edges Customer (test)' });
    await kit.startPolicy();
  });
  afterAll(async () => {
    await kit.restorePolicy();
    await retire(admin, kit.people);
    await closeDb();
  });

  it('6: resuming the day withdraws the waiting claim, and the next End duty makes a fresh one', async () => {
    const { person, me } = await workDay('Duty Resume Worker (test)', {});
    const first = await dbClaim(person);
    expect(first).toMatchObject({ status: 'pending', auto_made: true });
    const firstId = (await claimOf(person))[0]?.id;
    const resumed = await me.raw('POST', '/attendance/resume', {});
    expect(resumed.status).toBe(200);
    const [kept] = await rows<{ status: string; withdrawn_by_resume_at: string | null }>(
      'SELECT status, withdrawn_by_resume_at FROM travel_claims WHERE id = $1',
      [firstId],
    );
    // Kept, not deleted: cancelled and marked, so a link to it still opens.
    expect(kept?.status).toBe('cancelled');
    expect(kept?.withdrawn_by_resume_at).not.toBeNull();
    expect(
      await rows(
        'SELECT 1 FROM notifications WHERE subject_id = $1 AND subject_type = $2 AND read_at IS NULL',
        [firstId, 'travel_claim'],
      ),
    ).toHaveLength(0);
    const listed = await admin.get<TravelClaim[]>(`/travel-claims?userId=${person.id}`);
    expect(listed.find((c) => c.id === firstId)).toMatchObject({
      status: 'cancelled',
      withdrawn: true,
    });
    expect(await me.get<TravelClaim[]>('/me/travel-claims')).toHaveLength(0);
    // The day is open again; ending it makes a new claim, and the withdrawn one is not counted.
    await me.post('/attendance/check-out', {});
    const second = await rows<{ id: string; status: string }>(
      "SELECT id, status FROM travel_claims WHERE user_id = $1 AND status = 'pending'",
      [person.id],
    );
    expect(second).toHaveLength(1);
    expect(second[0]?.id).not.toBe(firstId);
    await morning();
    expect(
      (
        await rows<{ status: string }>('SELECT status FROM travel_claims WHERE id = $1', [
          second[0]?.id,
        ])
      )[0]?.status,
    ).toBe('approved');
    expect(
      (
        await rows<{ status: string }>('SELECT status FROM travel_claims WHERE id = $1', [firstId])
      )[0]?.status,
    ).toBe('cancelled');
    // Once approved, the day cannot be reopened.
    const refused = await me.raw<{ code?: string }>('POST', '/attendance/resume', {});
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('claim_exists');
  });

  it('7: a claim the person makes keeps the review reasons of the day', async () => {
    const skip = new Set([10, 11, 12, 13, 14, 15, 16, 17]);
    await putTravel({ autoClaim: false });
    try {
      const { person, me } = await workDay('Duty Own Claim Worker (test)', { skip });
      expect(await claimOf(person)).toHaveLength(0);
      const made = await me.post<TravelClaim>('/me/travel-claims', {
        workDate: indiaDate(),
        note: 'Made by hand (test)',
      });
      // Read as a manual claim: the gap is listed, "automatic approval is off" never is.
      expect(made).toMatchObject({
        autoMade: false,
        status: 'pending',
        reviewReasons: ['route_gap'],
      });
      const [seen] = await admin.get<TravelClaim[]>(`/travel-claims?userId=${person.id}`);
      expect(seen?.reviewReasons).toEqual(['route_gap']);
      await morning();
      expect((await dbClaim(person))?.status).toBe('pending');
    } finally {
      await putTravel({ autoClaim: true });
    }
  });

  it('8: a day with a route but no site visit pays nothing and makes no claim', async () => {
    const { person, day } = await workDay('Duty No Visit Worker (test)', {}, true, false);
    expect(day).toMatchObject({ paidM: 0, distanceM: 0, amountPaise: 0, claimable: false });
    const [saved] = await rows<{ paid_m: number; visits: number }>(
      'SELECT paid_m, visits FROM travel_days WHERE user_id = $1',
      [person.id],
    );
    expect(saved).toMatchObject({ paid_m: 0, visits: 0 });
    expect(await claimOf(person)).toHaveLength(0);
    await morning();
    expect(await claimOf(person)).toHaveLength(0);
  });

  it('9: an approver who saw an older amount is refused with 409 amount_changed', async () => {
    const skip = new Set([10, 11, 12, 13, 14, 15, 16, 17]);
    const { person } = await workDay('Duty Amount Worker (test)', { skip });
    const [claim] = await admin.get<TravelClaim[]>(`/travel-claims?userId=${person.id}`);
    expect(claim?.status).toBe('pending');
    const stale = await admin.raw<{ code?: string; details?: { amountPaise?: number } }>(
      'POST',
      `/travel-claims/${claim?.id}/decide`,
      {
        approve: true,
        note: 'Looks fine (test)',
        expectedAmountPaise: (claim?.amountPaise ?? 0) + 100,
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('amount_changed');
    expect(stale.body.details?.amountPaise).toBe(claim?.amountPaise);
    expect((await dbClaim(person))?.status).toBe('pending');
    const decided = await admin.post<TravelClaim>(`/travel-claims/${claim?.id}/decide`, {
      approve: true,
      note: 'Looks fine (test)',
      expectedAmountPaise: claim?.amountPaise,
    });
    expect(decided.status).toBe('approved');
  });
});
