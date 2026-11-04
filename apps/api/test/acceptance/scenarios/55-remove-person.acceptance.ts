import type { Departure } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, plantManager, retire } from '../support/people';
import { addDays, sellProject, today, uniquePhone } from '../support/sales';
import { roleIds, STAFF } from '../support/team';

// Before an admin removes someone they see one summary: what the person still has open,
// what the company still owes them, key permissions only they hold, and who the work
// would go to by default (spec Flow 5).
const TAG = 'remove person (test)';

describe('removal summary', () => {
  let admin: Session;
  let sales: Session;
  const people: OwnPerson[] = [];
  const person = async (name: string, roles?: readonly string[]) => {
    const made = await ownPerson(admin, name, roles);
    people.push(made);
    return made;
  };
  let leaver: OwnPerson;
  let manager: OwnPerson;
  const roleToArchive: string[] = [];

  const summary = (id: string) => admin.get<Departure>(`/people/${id}/departure`);

  beforeAll(async () => {
    admin = await Session.admin();
    sales = await Session.code(STAFF.sales.phone);
    manager = await person('Manager (remove test)', ['accounts']);
    leaver = await person('Leaver (remove test)');
    const first = await person('Report One (remove test)');
    const second = await person('Report Two (remove test)');
    await admin.patch(`/people/${leaver.id}`, { reportsToUserId: manager.id });
    await admin.patch(`/people/${first.id}`, { reportsToUserId: leaver.id });
    await admin.patch(`/people/${second.id}`, { reportsToUserId: leaver.id });

    const lead = await admin.post<{ id: string }>('/leads', {
      name: 'Open Lead (remove test)',
      phone: uniquePhone(),
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    // The API only lets sales own a lead; the leaver here is not in sales.
    await rows('UPDATE leads SET owner_user_id = $2 WHERE id = $1', [lead.id, leaver.id]);

    // An HR-only person may not manage through the API (project team rules), so the
    // project is planted on them, as the leads are.
    const sale = await sellProject(admin, {
      name: 'Leaver Project (test)',
    });
    await plantManager(sale.created.id, leaver.id);
    const projectId = sale.created.id;
    const tasks = await rows<{ id: string }>(
      'SELECT id FROM project_tasks WHERE project_id = $1 ORDER BY position LIMIT 2',
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
    await rows(
      'INSERT INTO wa_conversations (phone, customer_id, assigned_user_id) VALUES ($1, $2, $3)',
      [uniquePhone(), sale.customer.customerId, leaver.id],
    );
    // A report's leave waits on the leaver's first look; the leaver is a colleague's backup.
    const [waiting] = await rows<{ id: string }>(
      `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status, reason)
       VALUES ($1, 'casual', $2, $2, 2, 'pending', $3) RETURNING id`,
      [first.id, addDays(today(), 5), TAG],
    );
    await rows(
      "INSERT INTO leave_manager_reviews (leave_request_id, manager_user_id, state) VALUES ($1, $2, 'waiting')",
      [waiting?.id, leaver.id],
    );
    await rows(
      `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status, reason, backup_user_id)
       VALUES ($1, 'casual', $2, $3, 2, 'approved', $4, $5)`,
      [second.id, today(), addDays(today(), 2), TAG, leaver.id],
    );
    await rows(
      `INSERT INTO travel_claims (user_id, work_date, distance_m, rate_paise_per_km, amount_paise,
         legs, visits, status, note)
       VALUES ($1, $2, 92000, 2000, 184000, '[]'::jsonb, 1, 'pending', $3)`,
      [leaver.id, today(), TAG],
    );
  });

  afterAll(async () => {
    await rows('DELETE FROM travel_claims WHERE note = $1', [TAG]);
    await rows('DELETE FROM leave_requests WHERE reason = $1', [TAG]);
    await rows('DELETE FROM service_requests WHERE description = $1', [TAG]);
    for (const id of roleToArchive) await admin.patch(`/roles/${id}`, { archived: true });
    await retire(admin, people);
    await closeDb();
  });

  it('counts what the person still has open, and what they are owed', async () => {
    const result = await summary(leaver.id);
    expect(result.counts).toEqual({
      leads: 1,
      tasks: 1,
      proposedTasks: 1,
      serviceRequests: 1,
      discomSteps: 0,
      managedProjects: 1,
      teamProjects: 1,
      directReports: 2,
      chats: 1,
      leaveApprovals: 1,
      backupFor: 1,
      ownPendingLeave: 0,
      commissionRules: 0,
    });
    expect(result.settlement.travelClaims).toEqual({ count: 1, paise: 184000 });
    expect(result.settlement.payables).toEqual({ count: 0, paise: 0 });
    expect(result.settlement.pendingPoints).toBe(0);
    expect(result.suggestedTargetId).toBe(manager.id);
    expect(result.soleHolderOf).toEqual([]);
  });

  it('suggests nobody when the person has no manager', async () => {
    expect((await summary(manager.id)).suggestedTargetId).toBeNull();
  });

  it('soleHolderOf includes finance.approve_payments when nobody else has it', async () => {
    const role = await admin.post<{ id: string }>('/roles', {
      name: `Sole Payer ${uniquePhone()} (test)`,
      kind: 'staff',
      capabilities: ['finance.approve_payments'],
    });
    roleToArchive.push(role.id);
    await admin.patch(`/people/${leaver.id}`, {
      roleIds: [...(await roleIds(admin, ['hr'])), role.id],
    });
    const others = await rows<{ role_id: string; capability: string }>(
      `DELETE FROM role_capabilities WHERE capability = 'finance.approve_payments'
          AND role_id <> $1 RETURNING role_id, capability`,
      [role.id],
    );
    try {
      expect((await summary(leaver.id)).soleHolderOf).toEqual(['finance.approve_payments']);
      expect((await summary(manager.id)).soleHolderOf).toEqual([]);
    } finally {
      for (const row of others) {
        await rows('INSERT INTO role_capabilities (role_id, capability) VALUES ($1, $2)', [
          row.role_id,
          row.capability,
        ]);
      }
    }
    expect((await summary(leaver.id)).soleHolderOf).toEqual([]);
  });

  it('is for people managers only', async () => {
    expect((await sales.raw('GET', `/people/${leaver.id}/departure`)).status).toBe(403);
    expect((await admin.raw('GET', `/people/${crypto.randomUUID()}/departure`)).status).toBe(404);
  });
});
