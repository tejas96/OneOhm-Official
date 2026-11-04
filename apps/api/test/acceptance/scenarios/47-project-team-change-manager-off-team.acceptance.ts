import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { ownPerson, retire } from '../support/people';
import { sellProject } from '../support/sales';
import { patchTeam } from '../support/team-change';

// Ruling 8: the manager is on the project as manager, named team or not.
describe('Project team change: a manager off the named team', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const kinds = (userId: string, projectId: string) =>
    rows<{ kind: string }>(
      'SELECT kind FROM notifications WHERE user_id = $1 AND subject_id = $2',
      [userId, projectId],
    ).then((found) => found.map((row) => row.kind));
  const task = (id: string) =>
    rows<{ assignee_user_id: string | null; outside_team: boolean }>(
      'SELECT assignee_user_id, outside_team FROM project_tasks WHERE id = $1',
      [id],
    ).then((found) => found[0]);
  /** Gives `userId` one open task of the project (not `skip`), proposals cleared. */
  const openTask = async (projectId: string, userId: string, skip = '') => {
    const [row] = await rows<{ id: string }>(
      `SELECT id FROM project_tasks WHERE project_id = $1 AND status <> 'completed'
        AND id::text <> $2 ORDER BY id LIMIT 1`,
      [projectId, skip],
    );
    if (!row) throw new Error('No open task.');
    await rows(
      'UPDATE project_tasks SET assignee_user_id = $2, proposed_user_id = NULL WHERE id = $1',
      [row.id, userId],
    );
    return row.id;
  };

  it('the new manager taken off the team can take hand-overs, is not told they left, and is not outside', async () => {
    const x = await ownPerson(admin, 'Leaving Member (test)', ['execution']);
    const y = await ownPerson(admin, 'New Manager Off Team (test)', ['execution']);
    const z = await ownPerson(admin, 'Staying Member (test)', ['execution']);
    const sale = await sellProject(admin, { name: 'Manager Off Team (test)' });
    const id = sale.project.id;
    expect((await patchTeam(admin, id, { teamUserIds: [x.id, y.id, z.id] })).status).toBe(200);
    const held = await openTask(id, x.id);
    // y holds open work too, yet as the new manager needs no hand-over of their own.
    const own = await openTask(id, y.id, held);

    const reply = await patchTeam(admin, id, {
      managerUserId: y.id,
      teamUserIds: [z.id],
      handOver: [{ fromUserId: x.id, toUserId: y.id }],
    });
    expect(reply.status).toBe(200);
    expect(await task(held)).toEqual({ assignee_user_id: y.id, outside_team: false });
    expect(await task(own)).toEqual({ assignee_user_id: y.id, outside_team: false });
    expect(await kinds(y.id, id)).toContain('project_manager');
    expect(await kinds(y.id, id)).not.toContain('project_team_removed');
    expect(await kinds(x.id, id)).toContain('project_team_removed');
    await retire(admin, [x, y, z]);
  });

  it("does not flag the manager's own tasks as outside the team", async () => {
    const x = await ownPerson(admin, 'Only Member (test)', ['execution']);
    const sale = await sellProject(admin, { name: 'Manager Holds Task (test)' });
    const id = sale.project.id;
    // The admin manages; their task stays inside when the named team leaves them out.
    const held = await openTask(id, admin.userId);
    expect((await patchTeam(admin, id, { teamUserIds: [x.id] })).status).toBe(200);
    expect((await task(held))?.outside_team).toBe(false);
    await retire(admin, [x]);
  });
});
