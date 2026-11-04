import type { Departure, Person } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { seedWrapUp, WRAPPED_UP, wrapUpState } from '../support/departure';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { addDays, sellProject, today, uniquePhone } from '../support/sales';

// Remove from team (spec Flow 5): in one step all open work goes to one person, and the
// leaver's sign-ins, phones, location, open visit and queued messages are shut down.
// Money still owed to them is left as it is.
const TAG = 'remove and hand over (test)';
const one = async <T>(text: string, values: unknown[]) => (await rows<T>(text, values))[0];

describe('remove and hand over', () => {
  let admin: Session;
  const people: OwnPerson[] = [];
  const person = async (name: string) => {
    const made = await ownPerson(admin, name);
    people.push(made);
    return made;
  };
  let manager: OwnPerson;
  let leaver: OwnPerson;
  let target: OwnPerson;
  let report: OwnPerson;
  let onLeave: OwnPerson;
  let projectId = '';
  let leadId = '';
  let removed: Person;

  beforeAll(async () => {
    admin = await Session.admin();
    manager = await person('Manager (hand over test)');
    leaver = await person('Leaver (hand over test)');
    target = await person('Target (hand over test)');
    report = await person('Report (hand over test)');
    onLeave = await person('On Leave (hand over test)');
    await admin.patch(`/people/${leaver.id}`, { reportsToUserId: manager.id });
    // The target is one of the leaver's own reports.
    await admin.patch(`/people/${target.id}`, { reportsToUserId: leaver.id });
    await admin.patch(`/people/${report.id}`, { reportsToUserId: leaver.id });

    const lead = await admin.post<{ id: string }>('/leads', {
      name: 'Open Lead (hand over test)',
      phone: uniquePhone(),
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    leadId = lead.id;
    await rows('UPDATE leads SET owner_user_id = $2 WHERE id = $1', [leadId, leaver.id]);
    const sale = await sellProject(admin, { name: 'Hand Over Project (test)' });
    projectId = sale.created.id;
    await rows('UPDATE projects SET manager_user_id = $2 WHERE id = $1', [projectId, leaver.id]);
    const tasks = await rows<{ id: string }>(
      `SELECT id FROM project_tasks WHERE project_id = $1 AND status <> 'completed'
         ORDER BY position LIMIT 2`,
      [projectId],
    );
    await rows('UPDATE project_tasks SET assignee_user_id = $2 WHERE id = $1', [
      tasks[0]?.id,
      leaver.id,
    ]);
    await rows('UPDATE project_tasks SET proposed_user_id = $2 WHERE id = $1', [
      tasks[1]?.id,
      leaver.id,
    ]);
    await rows('INSERT INTO project_team_members (project_id, user_id) VALUES ($1, $2)', [
      projectId,
      leaver.id,
    ]);
    await rows(
      `INSERT INTO service_requests (customer_id, project_id, category, description, assignee_user_id)
       VALUES ($1, $2, 'inverter_fault', $3, $4)`,
      [sale.customer.customerId, projectId, TAG, leaver.id],
    );
    const request = await one<{ id: string }>(
      `INSERT INTO change_requests (number, type, customer_id, property_id, project_id, values)
       VALUES ($1, 'load_change', $2, $3, $4, '{}'::jsonb) RETURNING id`,
      [`CR-${uniquePhone()}`, sale.customer.customerId, sale.customer.propertyId, projectId],
    );
    await rows(
      `INSERT INTO change_request_steps (change_request_id, key, title, role_key,
         assignee_user_id, captures, due_date, position)
       VALUES ($1, 'apply', 'Apply (test)', 'liaisoning', $2, '{}', $3, 1)`,
      [request?.id, leaver.id, today()],
    );
    await rows('INSERT INTO wa_conversations (phone, assigned_user_id) VALUES ($1, $2)', [
      uniquePhone(),
      leaver.id,
    ]);
    await rows('INSERT INTO wa_conversations (phone, handled_by_user_id) VALUES ($1, $2)', [
      uniquePhone(),
      leaver.id,
    ]);
    const waiting = await one<{ id: string }>(
      `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status, reason)
       VALUES ($1, 'casual', $2, $2, 2, 'pending', $3) RETURNING id`,
      [report.id, addDays(today(), 5), TAG],
    );
    await rows(
      "INSERT INTO leave_manager_reviews (leave_request_id, manager_user_id, state) VALUES ($1, $2, 'waiting')",
      [waiting?.id, leaver.id],
    );
    await rows(
      `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status, reason, backup_user_id)
       VALUES ($1, 'casual', $2, $3, 2, 'approved', $4, $5)`,
      [onLeave.id, today(), addDays(today(), 2), TAG, leaver.id],
    );

    await seedWrapUp(leaver, TAG);

    // Money owed to them, which stays as it is.
    await rows(
      `INSERT INTO travel_claims (user_id, work_date, distance_m, rate_paise_per_km, amount_paise,
         legs, visits, status, note)
       VALUES ($1, $2, 1000, 2000, 50000, '[]'::jsonb, 1, 'pending', $3)`,
      [leaver.id, today(), TAG],
    );
    await rows(
      `INSERT INTO payables (party, party_name, party_user_id, description, amount_paise, due_on, status)
       VALUES ('employee', 'Leaver (test)', $1, $2, 70000, $3, 'approved')`,
      [leaver.id, TAG, today()],
    );

    removed = await admin.post<Person>(`/people/${leaver.id}/remove`, {
      handToUserId: target.id,
      lastWorkingDay: today(),
      tellCustomers: false,
    });
  });

  afterAll(async () => {
    await rows('DELETE FROM travel_claims WHERE note = $1', [TAG]);
    await rows('DELETE FROM payables WHERE description = $1', [TAG]);
    await rows("DELETE FROM leave_requests WHERE reason LIKE $1 || '%'", [TAG]);
    await rows('DELETE FROM service_requests WHERE description = $1', [TAG]);
    await retire(admin, people);
    await closeDb();
  });

  it('remove moves everything to the target', async () => {
    expect(removed.status).toBe('inactive');
    expect(removed.leftOn).toBe(today());
    const { counts } = await admin.get<Departure>(`/people/${leaver.id}/departure`);
    for (const [key, value] of Object.entries(counts)) expect([key, value]).toEqual([key, 0]);
    const owned = await one<Record<string, number>>(
      `SELECT
         (SELECT count(*)::int FROM leads WHERE id = $2 AND owner_user_id = $1) AS leads,
         (SELECT count(*)::int FROM project_tasks WHERE project_id = $3 AND assignee_user_id = $1) AS tasks,
         (SELECT count(*)::int FROM project_tasks WHERE project_id = $3 AND proposed_user_id = $1) AS proposed,
         (SELECT count(*)::int FROM service_requests WHERE description = $4 AND assignee_user_id = $1) AS requests,
         (SELECT count(*)::int FROM change_request_steps s JOIN change_requests r
            ON r.id = s.change_request_id WHERE r.project_id = $3 AND s.assignee_user_id = $1) AS steps,
         (SELECT count(*)::int FROM projects WHERE id = $3 AND manager_user_id = $1) AS managed,
         (SELECT count(*)::int FROM project_team_members WHERE project_id = $3 AND user_id = $1) AS team,
         (SELECT count(*)::int FROM wa_conversations WHERE assigned_user_id = $1) AS assigned,
         (SELECT count(*)::int FROM wa_conversations WHERE handled_by_user_id = $1) AS handled,
         (SELECT count(*)::int FROM leave_manager_reviews WHERE manager_user_id = $1) AS reviews,
         (SELECT count(*)::int FROM leave_requests WHERE backup_user_id = $1) AS backups`,
      [target.id, leadId, projectId, TAG],
    );
    expect(owned).toEqual({
      leads: 1,
      tasks: 1,
      proposed: 1,
      requests: 1,
      steps: 1,
      managed: 1,
      team: 1,
      assigned: 1,
      handled: 1,
      reviews: 1,
      backups: 1,
    });
    const note = `Handed over from ${leaver.name} (left the team)`;
    const notes = await one<{ project: number; lead: number }>(
      `SELECT
         (SELECT count(*)::int FROM project_activities WHERE project_id = $1
            AND kind = 'task_handover' AND message = $3) AS project,
         (SELECT count(*)::int FROM lead_activities WHERE lead_id = $2
            AND kind = 'note' AND internal AND note = $3) AS lead`,
      [projectId, leadId, note],
    );
    expect(notes).toEqual({ project: 1, lead: 1 });
    const told = await rows('SELECT 1 FROM notifications WHERE user_id = $1 AND kind = $2', [
      onLeave.id,
      'leave_backup',
    ]);
    expect(told).toHaveLength(1);
  });

  it("a direct report who is the target goes to the leaver's manager", async () => {
    const lines = await rows<{ user_id: string; manager_user_id: string }>(
      'SELECT user_id, manager_user_id FROM reporting_lines WHERE user_id = ANY($1)',
      [[target.id, report.id]],
    );
    const managerOf = new Map(lines.map((line) => [line.user_id, line.manager_user_id]));
    expect(managerOf.get(target.id)).toBe(manager.id);
    expect(managerOf.get(report.id)).toBe(target.id);
  });

  it('sessions gone, devices disabled, consent withdrawn, open visit closed, pending leave cancelled, pending staff outbox skipped', async () => {
    expect(await wrapUpState(leaver, TAG)).toEqual(WRAPPED_UP);
  });

  it('pending and approved commissions and travel claims are untouched', async () => {
    const claim = await one<{ status: string }>(
      'SELECT status FROM travel_claims WHERE note = $1',
      [TAG],
    );
    const payable = await one<{ status: string }>(
      'SELECT status FROM payables WHERE description = $1',
      [TAG],
    );
    expect(claim?.status).toBe('pending');
    expect(payable?.status).toBe('approved');
    const { settlement } = await admin.get<Departure>(`/people/${leaver.id}/departure`);
    expect(settlement.travelClaims).toEqual({ count: 1, paise: 50000 });
    expect(settlement.payables).toEqual({ count: 1, paise: 70000 });
  });

  it('target gets one departure_cover notice', async () => {
    const notices = await rows<{ title: string; body: string }>(
      "SELECT title, body FROM notifications WHERE user_id = $1 AND kind = 'departure_cover'",
      [target.id],
    );
    expect(notices).toEqual([
      {
        title: `You are now covering ${leaver.name}'s work`,
        body: '1 lead, 2 tasks, 1 service request, 1 DISCOM step, 1 project to manage, 1 project team, 1 direct report, 2 WhatsApp chats, 1 leave request to review, 1 leave to cover are now yours.',
      },
    ]);
  });
});
