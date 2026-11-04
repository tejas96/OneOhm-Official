import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { sellProject, today } from '../support/sales';

// Remove from team, the edges of a handover: reporting chains deeper than one level, an
// inactive manager, a target already on the team, and a second submit.
describe('removal edges', () => {
  let admin: Session;
  const people: OwnPerson[] = [];
  const person = async (name: string) => {
    const made = await ownPerson(admin, name);
    people.push(made);
    return made;
  };
  const remove = (id: string, handToUserId: string) =>
    admin.raw<{ code: string; message: string }>('POST', `/people/${id}/remove`, {
      handToUserId,
      lastWorkingDay: today(),
      tellCustomers: false,
    });
  const line = (from: OwnPerson, to: OwnPerson) =>
    rows('INSERT INTO reporting_lines (user_id, manager_user_id) VALUES ($1, $2)', [
      from.id,
      to.id,
    ]);
  const managerOf = async (who: OwnPerson) => {
    const [row] = await rows<{ manager_user_id: string }>(
      'SELECT manager_user_id FROM reporting_lines WHERE user_id = $1',
      [who.id],
    );
    return row?.manager_user_id ?? null;
  };

  beforeAll(async () => {
    admin = await Session.admin();
  });

  afterAll(async () => {
    await retire(admin, people);
    await closeDb();
  });

  it("a target below the leaver's reports takes the leaver's place, with no loop", async () => {
    const manager = await person('Chain Manager (edge test)');
    const leaver = await person('Chain Leaver (edge test)');
    const report = await person('Chain Report (edge test)');
    const target = await person('Chain Target (edge test)');
    await line(leaver, manager);
    await line(report, leaver);
    await line(target, report);
    expect((await remove(leaver.id, target.id)).status).toBe(200);
    expect(await managerOf(target)).toBe(manager.id);
    expect(await managerOf(report)).toBe(target.id);
    expect(await managerOf(manager)).toBeNull();
  });

  it("an inactive manager of the leaver is never the target's new manager", async () => {
    const gone = await person('Gone Manager (edge test)');
    const leaver = await person('Leaver Under Gone (edge test)');
    const target = await person('Target Under Leaver (edge test)');
    await line(leaver, gone);
    await line(target, leaver);
    await admin.patch(`/people/${gone.id}`, { status: 'inactive' });
    expect((await remove(leaver.id, target.id)).status).toBe(200);
    expect(await managerOf(target)).toBeNull();
  });

  it('a target already on the team keeps one place, and a task counts once', async () => {
    const leaver = await person('Team Leaver (edge test)');
    const target = await person('Team Target (edge test)');
    const sale = await sellProject(admin, { name: 'Shared Team Project (test)' });
    const projectId = sale.created.id;
    for (const member of [leaver, target])
      await rows('INSERT INTO project_team_members (project_id, user_id) VALUES ($1, $2)', [
        projectId,
        member.id,
      ]);
    await rows(
      `UPDATE project_tasks SET assignee_user_id = $2, proposed_user_id = $2 WHERE id = (
         SELECT id FROM project_tasks WHERE project_id = $1 AND status <> 'completed'
         ORDER BY position LIMIT 1)`,
      [projectId, leaver.id],
    );
    expect((await remove(leaver.id, target.id)).status).toBe(200);
    const team = await rows<{ user_id: string }>(
      'SELECT user_id FROM project_team_members WHERE project_id = $1 AND user_id = ANY($2)',
      [projectId, [leaver.id, target.id]],
    );
    expect(team.map((row) => row.user_id)).toEqual([target.id]);
    const notices = await rows<{ body: string }>(
      "SELECT body FROM notifications WHERE user_id = $1 AND kind = 'departure_cover'",
      [target.id],
    );
    expect(notices.map((notice) => notice.body)).toEqual(['1 task, 1 project team are now yours.']);
  });

  it('removing someone already removed is refused, with one audit entry', async () => {
    const leaver = await person('Twice Removed (edge test)');
    const target = await person('Twice Target (edge test)');
    expect((await remove(leaver.id, target.id)).status).toBe(200);
    const again = await remove(leaver.id, target.id);
    expect([again.status, again.body.code, again.body.message]).toEqual([
      409,
      'already_removed',
      'This person has already left the team.',
    ]);
    const audits = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'person.removed' AND entity_id = $1",
      [leaver.id],
    );
    expect(audits).toHaveLength(1);
    const switchedOff = await person('Switched Off Earlier (edge test)');
    await admin.patch(`/people/${switchedOff.id}`, { status: 'inactive' });
    expect((await remove(switchedOff.id, target.id)).body.code).toBe('already_removed');
  });
});
