import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { ownPerson, retire } from '../support/people';
import { sellProject } from '../support/sales';
import { patchTeam } from '../support/team-change';

// A removed person's open tasks must not be left behind without a choice.
describe('Project team change: handing over open tasks', () => {
  type Failure = { fieldErrors?: Record<string, string> };
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** A project whose team is x and y, where x holds two open tasks and one finished one. */
  async function holding(label: string) {
    const x = await ownPerson(admin, `Leaver ${label} (test)`, ['execution']);
    const y = await ownPerson(admin, `Taker ${label} (test)`, ['execution']);
    const sale = await sellProject(admin, { name: `Handover ${label} (test)` });
    const id = sale.project.id;
    expect((await patchTeam(admin, id, { teamUserIds: [x.id, y.id] })).status).toBe(200);
    const tasks = await rows<{ id: string }>(
      'SELECT id FROM project_tasks WHERE project_id = $1 ORDER BY id LIMIT 3',
      [id],
    );
    const [open, proposed, done] = tasks.map((task) => task.id);
    await rows('UPDATE project_tasks SET assignee_user_id = $2 WHERE id = $1', [open, x.id]);
    await rows(
      `UPDATE project_tasks SET assignee_user_id = NULL, proposed_user_id = $2 WHERE id = $1`,
      [proposed, x.id],
    );
    await rows(
      `UPDATE project_tasks SET assignee_user_id = $2, status = 'completed', completed_at = now()
       WHERE id = $1`,
      [done, x.id],
    );
    return { x, y, id, open, proposed, done };
  }
  const holders = (ids: string[]) =>
    rows<{ id: string; assignee_user_id: string | null; proposed_user_id: string | null }>(
      'SELECT id, assignee_user_id, proposed_user_id FROM project_tasks WHERE id = ANY($1)',
      [ids],
    );

  it("asks what to do with a removed person's open tasks", async () => {
    const t = await holding('Ask');
    const reply = await patchTeam(admin, t.id, { teamUserIds: [t.y.id] });
    expect(reply.status).toBe(400);
    expect((reply.body as Failure).fieldErrors?.handOver).toBeTruthy();
    const team = await rows('SELECT 1 FROM project_team_members WHERE project_id = $1', [t.id]);
    expect(team).toHaveLength(2);
    await retire(admin, [t.x, t.y]);
  });

  it('moves open tasks and proposals to the chosen person', async () => {
    const t = await holding('Move');
    const reply = await patchTeam(admin, t.id, {
      teamUserIds: [t.y.id],
      handOver: [{ fromUserId: t.x.id, toUserId: t.y.id }],
    });
    expect(reply.status).toBe(200);
    const after = Object.fromEntries(
      (await holders([t.open, t.proposed, t.done])).map((r) => [r.id, r]),
    );
    expect(after[t.open]?.assignee_user_id).toBe(t.y.id);
    expect(after[t.proposed]?.proposed_user_id).toBe(t.y.id);
    expect(after[t.done]?.assignee_user_id).toBe(t.x.id);
    const told = await rows(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'task_assigned'`,
      [t.y.id],
    );
    expect(told.length).toBeGreaterThan(0);
    await retire(admin, [t.x, t.y]);
  });

  it('keeps tasks when told to', async () => {
    const t = await holding('Keep');
    const reply = await patchTeam(admin, t.id, {
      teamUserIds: [t.y.id],
      handOver: [{ fromUserId: t.x.id, toUserId: null }],
    });
    expect(reply.status).toBe(200);
    const after = Object.fromEntries((await holders([t.open, t.proposed])).map((r) => [r.id, r]));
    expect(after[t.open]?.assignee_user_id).toBe(t.x.id);
    expect(after[t.proposed]?.proposed_user_id).toBe(t.x.id);
    await retire(admin, [t.x, t.y]);
  });

  it('rejects handing over to a removed or inactive person', async () => {
    const t = await holding('Bad');
    const gone = await ownPerson(admin, 'Gone Taker (test)', ['execution']);
    await retire(admin, [gone]);
    for (const to of [t.x.id, gone.id]) {
      const reply = await patchTeam(admin, t.id, {
        teamUserIds: [t.y.id],
        handOver: [{ fromUserId: t.x.id, toUserId: to }],
      });
      expect(reply.status).toBe(400);
      expect((reply.body as Failure).fieldErrors?.handOver).toBeTruthy();
    }
    const [row] = await holders([t.open]);
    expect(row?.assignee_user_id).toBe(t.x.id);
    await retire(admin, [t.x, t.y]);
  });
});
