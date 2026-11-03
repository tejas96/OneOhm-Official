import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';
import { STAFF } from '../support/team';
import { patchTeam } from '../support/team-change';

// Changing a project's team must leave a trail: who managed it, and when.
describe('Project team change', () => {
  let admin: Session;
  let manager1: string;
  const userByPhone = async (phone: string) => {
    const [row] = await rows<{ id: string }>('SELECT id FROM users WHERE phone_e164 = $1', [phone]);
    if (!row) throw new Error(`No user with phone ${phone}`);
    return row.id;
  };
  const terms = (projectId: string) =>
    rows<{ user_id: string; open: boolean }>(
      `SELECT user_id, ended_at IS NULL AS open FROM project_manager_terms
       WHERE project_id = $1 ORDER BY started_at`,
      [projectId],
    );

  beforeAll(async () => {
    admin = await Session.admin();
    manager1 = await userByPhone(STAFF.execution.phone);
  });
  afterAll(closeDb);

  // Needs ProjectTeamService.update to write terms (Task 8).
  it.todo('records a manager term at creation and on each change');

  it('records a manager term at creation', async () => {
    const sale = await sellProject(admin, { name: 'Term At Creation (test)' });
    expect((await terms(sale.project.id)).map((row) => [row.user_id, row.open])).toEqual([
      [admin.userId, true],
    ]);
  });

  it('re-saving the same manager adds no term', async () => {
    const sale = await sellProject(admin, {
      name: 'Same Manager (test)',
      managerUserId: manager1,
    });
    const before = await terms(sale.project.id);
    const reply = await patchTeam(admin, sale.project.id, { managerUserId: manager1 });
    expect(reply.status).toBeLessThan(300);
    const after = await terms(sale.project.id);
    expect(after).toEqual(before);
    expect(after.map((row) => [row.user_id, row.open])).toEqual([[manager1, true]]);
  });
});
