import type { Departure } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { addDays, sellProject, today } from '../support/sales';

// The removal summary leaves out what is not open work or not money still owed: items on
// finished projects, people who already left, closed leave, and money counted elsewhere.
const TAG = 'removal summary edges (test)';

describe('removal summary: what is not counted', () => {
  let admin: Session;
  const people: OwnPerson[] = [];
  const person = async (name: string) => {
    const made = await ownPerson(admin, name);
    people.push(made);
    return made;
  };
  let other: OwnPerson;
  const summary = (id: string) => admin.get<Departure>(`/people/${id}/departure`);

  afterAll(async () => {
    await rows('DELETE FROM travel_claims WHERE note = $1', [TAG]);
    await rows('DELETE FROM payables WHERE description = $1', [TAG]);
    await rows('DELETE FROM leave_requests WHERE reason = $1', [TAG]);
    await retire(admin, people);
    await closeDb();
  });

  const claim = async (day: number, status: string, payableId: string | null) =>
    rows(
      `INSERT INTO travel_claims (user_id, work_date, distance_m, rate_paise_per_km,
           amount_paise, legs, visits, status, note, payable_id)
         VALUES ($1, $2, 1000, 2000, 50000, '[]'::jsonb, 1, $3, $4, $5)`,
      [other.id, addDays(today(), -day), status, TAG, payableId],
    );
  const payable = async (status: string) => {
    const [made] = await rows<{ id: string }>(
      `INSERT INTO payables (party, party_name, party_user_id, description, amount_paise,
           due_on, status)
         VALUES ('employee', 'Edge (test)', $1, $2, 50000, $3, $4) RETURNING id`,
      [other.id, TAG, today(), status],
    );
    return made?.id ?? null;
  };

  beforeAll(async () => {
    admin = await Session.admin();
    other = await person('Edge Leaver (remove test)');
  });

  it('counts a pending claim, an unpaid approved claim once, and a paid one never', async () => {
    await claim(1, 'pending', null);
    expect((await summary(other.id)).settlement.travelClaims).toEqual({
      count: 1,
      paise: 50000,
    });
    await rows('UPDATE travel_claims SET status = $2 WHERE user_id = $1', [other.id, 'approved']);
    const unpaid = await payable('approved');
    await rows('UPDATE travel_claims SET payable_id = $2 WHERE user_id = $1', [other.id, unpaid]);
    const overall = (await summary(other.id)).settlement;
    expect(overall.travelClaims).toEqual({ count: 0, paise: 0 });
    expect(overall.payables).toEqual({ count: 1, paise: 50000 });
    await rows("UPDATE payables SET status = 'paid' WHERE id = $1", [unpaid]);
    const paid = (await summary(other.id)).settlement;
    expect(paid.travelClaims).toEqual({ count: 0, paise: 0 });
    expect(paid.payables).toEqual({ count: 0, paise: 0 });
  });

  it('leaves out tasks and teams on finished projects, and people who already left', async () => {
    const cancelled = await sellProject(admin, { name: 'Cancelled Edge (test)' });
    const done = await sellProject(admin, { name: 'Done Edge (test)' });
    await rows("UPDATE projects SET status = 'cancelled' WHERE id = $1", [cancelled.created.id]);
    await rows("UPDATE projects SET status = 'completed' WHERE id = $1", [done.created.id]);
    await rows(
      `UPDATE project_tasks SET assignee_user_id = $2, proposed_user_id = $2 WHERE id = (
           SELECT id FROM project_tasks WHERE project_id = $1 AND status <> 'completed' LIMIT 1)`,
      [cancelled.created.id, other.id],
    );
    await rows('INSERT INTO project_team_members (project_id, user_id) VALUES ($1, $2)', [
      done.created.id,
      other.id,
    ]);
    const gone = await person('Past Report (remove test)');
    await rows('INSERT INTO reporting_lines (user_id, manager_user_id) VALUES ($1, $2)', [
      gone.id,
      other.id,
    ]);
    await admin.patch(`/people/${gone.id}`, { status: 'inactive' });
    const [kept] = await rows<{ count: number }>(
      'SELECT count(*)::int AS count FROM reporting_lines WHERE manager_user_id = $1',
      [other.id],
    );
    expect(kept?.count).toBe(1);
    const [review] = await rows<{ id: string }>(
      `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status, reason)
         VALUES ($1, 'casual', $2, $2, 2, 'cancelled', $3) RETURNING id`,
      [admin.userId, addDays(today(), 7), TAG],
    );
    await rows(
      "INSERT INTO leave_manager_reviews (leave_request_id, manager_user_id, state) VALUES ($1, $2, 'waiting')",
      [review?.id, other.id],
    );
    const { counts } = await summary(other.id);
    expect(counts.tasks).toBe(0);
    expect(counts.proposedTasks).toBe(0);
    expect(counts.teamProjects).toBe(0);
    expect(counts.directReports).toBe(0);
    expect(counts.leaveApprovals).toBe(0);
  });

  it('suggests nobody when the manager only sells as a reseller', async () => {
    const partner = await ownPerson(admin, 'Reseller Boss (remove test)', ['reseller']);
    people.push(partner);
    await rows('INSERT INTO reporting_lines (user_id, manager_user_id) VALUES ($1, $2)', [
      other.id,
      partner.id,
    ]);
    expect((await summary(other.id)).suggestedTargetId).toBeNull();
  });
});
