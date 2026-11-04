import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { ownPerson, retire } from '../support/people';
import { createQuotation, discomId, type Sale, sellProject, today } from '../support/sales';
import { STAFF } from '../support/team';
import { patchTeam } from '../support/team-change';

// A team change reaches everyone it touches: tasks, the chat, the customer and the team.
describe('Project team change: applying it', () => {
  let admin: Session;
  let manager1: string;
  beforeAll(async () => {
    admin = await Session.admin();
    const [row] = await rows<{ id: string }>('SELECT id FROM users WHERE phone_e164 = $1', [
      STAFF.execution.phone,
    ]);
    if (!row) throw new Error('No execution person seeded.');
    manager1 = row.id;
  });
  afterAll(closeDb);

  const ok = async (projectId: string, body: Record<string, unknown>) => {
    const reply = await patchTeam(admin, projectId, body);
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  };
  const kinds = (userId: string, projectId: string) =>
    rows<{ kind: string; body: string }>(
      `SELECT kind, body FROM notifications WHERE user_id = $1 AND subject_id = $2`,
      [userId, projectId],
    ).then((found) => found.map((row) => row.kind));
  const told = (sale: Sale) =>
    rows<{ dedupe_key: string; payload: Record<string, string> }>(
      `SELECT dedupe_key, payload FROM outbox
       WHERE template = 'project_manager_changed' AND recipient = $1`,
      [sale.customer.phone],
    );

  it('records a manager term at creation and on each change', async () => {
    const sale = await sellProject(admin, { name: 'Term Each Change (test)' });
    const id = sale.project.id;
    await ok(id, { managerUserId: manager1 });
    await ok(id, { managerUserId: admin.userId });
    const terms = await rows<{ user_id: string; open: boolean }>(
      `SELECT user_id, ended_at IS NULL AS open FROM project_manager_terms
       WHERE project_id = $1 ORDER BY started_at`,
      [id],
    );
    expect(terms.map((row) => [row.user_id, row.open])).toEqual([
      [admin.userId, false],
      [manager1, false],
      [admin.userId, true],
    ]);
  });

  it('clears the outside flag when the person joins the team', async () => {
    const x = await ownPerson(admin, 'Team Member Flag (test)', ['execution']);
    const z = await ownPerson(admin, 'Outsider Flag (test)', ['execution']);
    const sale = await sellProject(admin, { name: 'Outside Flag (test)' });
    const id = sale.project.id;
    await ok(id, { teamUserIds: [x.id] });
    const [task] = await rows<{ id: string }>(
      `SELECT id FROM project_tasks WHERE project_id = $1 AND status <> 'completed' LIMIT 1`,
      [id],
    );
    if (!task) throw new Error('No open task.');
    await rows(
      'UPDATE project_tasks SET assignee_user_id = $2, outside_team = true WHERE id = $1',
      [task.id, z.id],
    );
    const flag = async () =>
      (
        await rows<{ outside_team: boolean }>(
          'SELECT outside_team FROM project_tasks WHERE id = $1',
          [task.id],
        )
      )[0]?.outside_team;
    await ok(id, { teamUserIds: [x.id, z.id] });
    expect(await flag()).toBe(false);
    // Kept with them when they leave the team: now outside it.
    await ok(id, { teamUserIds: [x.id], handOver: [{ fromUserId: z.id, toUserId: null }] });
    expect(await flag()).toBe(true);
    await retire(admin, [x, z]);
  });

  it('does not move the chat for an older project', async () => {
    const older = await sellProject(admin, { name: 'Two Projects (test)' });
    const quotation = await createQuotation(admin, older.customer);
    await admin.post(`/quotations/${quotation.id}/send`);
    await admin.post(`/quotations/${quotation.id}/accept`);
    const newer = await admin.post<{ id: string }>('/projects', {
      quotationId: quotation.id,
      discomId: await discomId(admin, 'MSEDCL'),
      loan: false,
      lenderName: null,
      loanPaise: 0,
      battery: false,
      groundMount: false,
      startDate: today(),
      managerUserId: admin.userId,
    });
    await rows(
      `INSERT INTO wa_conversations (phone, customer_id, assigned_user_id) VALUES ($1, $2, $3)`,
      [older.customer.phone, older.customer.customerId, admin.userId],
    );
    const owner = async () =>
      (
        await rows<{ assigned_user_id: string }>(
          'SELECT assigned_user_id FROM wa_conversations WHERE phone = $1',
          [older.customer.phone],
        )
      )[0]?.assigned_user_id;
    await ok(older.project.id, { managerUserId: manager1 });
    expect(await owner()).toBe(admin.userId);
    await ok(newer.id, { managerUserId: manager1 });
    expect(await owner()).toBe(manager1);
    // A newer project with nobody managing it does not lead the chat (as chatOwnerFor).
    await rows('UPDATE projects SET manager_user_id = NULL WHERE id = $1', [newer.id]);
    await ok(older.project.id, { managerUserId: admin.userId });
    expect(await owner()).toBe(admin.userId);
  });

  it('tells the customer about a new manager', async () => {
    const sale = await sellProject(admin, { name: 'Customer Told (test)' });
    const id = sale.project.id;
    await ok(id, { targetFinishDate: '2099-01-01' });
    expect(await told(sale)).toHaveLength(0);
    await ok(id, { managerUserId: manager1 });
    await ok(id, { managerUserId: manager1 });
    const sent = await told(sale);
    const [term] = await rows<{ id: string }>(
      'SELECT id FROM project_manager_terms WHERE project_id = $1 AND ended_at IS NULL',
      [id],
    );
    expect(sent.map((row) => row.dedupe_key)).toEqual([
      `project_manager_changed:${id}:${term?.id}`,
    ]);
    expect(sent[0]?.payload).toMatchObject({
      customer: sale.customer.name,
      project: sale.project.code,
      manager: STAFF.execution.name,
    });
    expect(sent[0]?.payload.phone).toBeTruthy();
    // Back and forth: every real change is news, so the customer has the right number.
    await ok(id, { managerUserId: admin.userId });
    await ok(id, { managerUserId: manager1 });
    expect(await told(sale)).toHaveLength(3);
  });

  it('tells added, removed people and the old manager', async () => {
    const old = await ownPerson(admin, 'Old Manager Told (test)', ['execution']);
    const next = await ownPerson(admin, 'New Manager Told (test)', ['execution']);
    const x = await ownPerson(admin, 'Leaving Member (test)', ['execution']);
    const y = await ownPerson(admin, 'Joining Member (test)', ['execution']);
    const sale = await sellProject(admin, { name: 'People Told (test)' });
    const id = sale.project.id;
    await ok(id, { managerUserId: old.id, teamUserIds: [x.id] });
    const [task] = await rows<{ id: string }>(
      `SELECT id FROM project_tasks WHERE project_id = $1 AND status <> 'completed' LIMIT 1`,
      [id],
    );
    await rows(
      `UPDATE project_tasks SET status = 'in_review', approval = true, reviewer = 'project_manager'
       WHERE id = $1`,
      [task?.id],
    );
    await ok(id, {
      managerUserId: next.id,
      teamUserIds: [y.id],
      handOver: [{ fromUserId: x.id, toUserId: null }],
    });
    expect(await kinds(old.id, id)).toContain('project_manager_removed');
    expect(await kinds(x.id, id)).toContain('project_team_removed');
    expect(await kinds(y.id, id)).toContain('project_team_added');
    const [notice] = await rows<{ body: string }>(
      `SELECT body FROM notifications WHERE user_id = $1 AND kind = 'project_manager'`,
      [next.id],
    );
    expect(notice?.body).toContain('1 review waits for you');
    // The person making the change is not told about it.
    expect(await kinds(admin.userId, id)).not.toContain('project_team_added');
    await retire(admin, [old, next, x, y]);
  });

  it('writes the change to the timeline and audit', async () => {
    const x = await ownPerson(admin, 'Timeline Member (test)', ['execution']);
    const sale = await sellProject(admin, { name: 'Timeline (test)' });
    const id = sale.project.id;
    await ok(id, { managerUserId: manager1, teamUserIds: [x.id], targetFinishDate: '2099-01-01' });
    const activities = await rows<{ kind: string; message: string }>(
      `SELECT kind, message FROM project_activities
       WHERE project_id = $1 AND kind IN ('manager_changed', 'team_changed', 'target_changed')`,
      [id],
    );
    const said = Object.fromEntries(activities.map((row) => [row.kind, row.message]));
    expect(said.manager_changed).toMatch(/now manages this project \(was /);
    expect(said.team_changed).toContain(`Added: ${x.name}.`);
    expect(said.target_changed).toMatch(/^Target finish moved to .*2099/);
    const [audit] = await rows<{ data: Record<string, unknown> }>(
      `SELECT data FROM audit_log WHERE action = 'project.team_changed' AND entity_id = $1`,
      [id],
    );
    expect(audit?.data).toMatchObject({
      previousTeamUserIds: expect.any(Array),
      previousManagerUserId: admin.userId,
    });
    expect(audit?.data).toHaveProperty('previousTargetFinishDate');
    await retire(admin, [x]);
  });
});
