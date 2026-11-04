import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import { ownPerson, pastMemberAsBefore, retire } from '../support/people';
import { sellProject } from '../support/sales';
import { project } from '../support/tasks';
import { patchTeam } from '../support/team-change';

// Saving the team sheet must not get stuck, and must not overwrite someone else's save.
describe('Project team change: saving', () => {
  type Failure = { code?: string };
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('saves when a team member became inactive', async () => {
    const x = await ownPerson(admin, 'Retiring Member (test)', ['execution']);
    const y = await ownPerson(admin, 'Staying Member (test)', ['execution']);
    const sale = await sellProject(admin, { name: 'Inactive Member (test)' });
    expect((await patchTeam(admin, sale.project.id, { teamUserIds: [x.id, y.id] })).status).toBe(
      200,
    );
    // Inactive with no handover (a past member from before Remove from team): Remove from
    // team would take them off the project's team, which is not what this case is about.
    await pastMemberAsBefore(x.id);
    const kept = await patchTeam(admin, sale.project.id, {
      teamUserIds: [x.id, y.id],
      targetFinishDate: '2099-01-01',
    });
    expect(kept.status).toBe(200);
    const detail = await project(admin, sale.project.id);
    expect(detail.setup.team.map((m) => [m.id, m.active]).sort()).toEqual(
      [
        [x.id, false],
        [y.id, true],
      ].sort(),
    );
    // The leaver may hold tasks from the team they were on: hand them to y.
    const added = await patchTeam(admin, sale.project.id, {
      teamUserIds: [y.id],
      handOver: [{ fromUserId: x.id, toUserId: y.id }],
    });
    expect(added.status).toBe(200);
    await retire(admin, [y]);
  });

  it('rejects a stale save', async () => {
    const sale = await sellProject(admin, { name: 'Stale Save (test)' });
    const before = await project(admin, sale.project.id);
    const first = await patchTeam(admin, sale.project.id, {
      version: before.version,
      targetFinishDate: '2099-01-01',
    });
    expect(first.status).toBe(200);
    const second = await patchTeam(admin, sale.project.id, {
      version: before.version,
      targetFinishDate: '2099-02-02',
    });
    expect(second.status).toBe(409);
    expect((second.body as Failure).code).toBe('stale');
    const after = await project(admin, sale.project.id);
    expect(after.version).toBe(before.version + 1);
  });
});
