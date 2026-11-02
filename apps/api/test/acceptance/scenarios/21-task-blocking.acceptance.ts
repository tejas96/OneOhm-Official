import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { Session } from '../support/http';
import { type Sale, sellProject } from '../support/sales';
import { project } from '../support/tasks';

// Spec 3.4: every task shows what it waits for and what waits for it.
describe('Task blocking', () => {
  let admin: Session;
  let sale: Sale;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Blocking Links (test)' });
  });
  afterAll(closeDb);

  it('a blocked task names its blocker, and the blocker names it back', async () => {
    const detail = await project(admin, sale.project.id);
    const blocked = detail.tasks.find((task) => task.blockedBy.length > 0);
    expect(blocked).toBeDefined();
    const blocker = detail.tasks.find((task) => task.title === blocked?.blockedBy[0]);
    expect(blocker?.blocking).toContain(blocked?.title);
  });
});
