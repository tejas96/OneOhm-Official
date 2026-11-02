import type { ProjectTask } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ageTask, closeDb } from '../support/db';
import { Session } from '../support/http';
import { type Sale, sellProject } from '../support/sales';
import { project, sessionOf, surveyFacts, taskByKey, workTask } from '../support/tasks';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// Each checklist tick is saved the moment it is made, so ticks are never lost and a tick
// counts as an update: it clears "stale" (spec 3.5).
describe('Checklist ticks', () => {
  let admin: Session;
  let sale: Sale;
  const survey = async () => taskByKey(await project(admin, sale.project.id), 'site_survey');
  const tick = (who: Session, task: ProjectTask, key: string, done: boolean) =>
    who.raw('POST', `/tasks/${task.id}/checklist`, { key, done });

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Ticked Off (test)' });
  });
  afterAll(closeDb);

  it('a tick is saved at once and shows as done', async () => {
    const task = await survey();
    const key = task.checklist[0]?.key ?? '';
    const doer = await sessionOf(admin, task.assignee?.id ?? '');
    expect((await tick(doer, task, key, true)).status).toBe(200);
    expect((await survey()).checklist[0]?.done).toBe(true);
  });

  it('unticking takes it back', async () => {
    const task = await survey();
    const doer = await sessionOf(admin, task.assignee?.id ?? '');
    await tick(doer, task, task.checklist[0]?.key ?? '', false);
    expect((await survey()).checklist[0]?.done).toBe(false);
  });

  it('a tick clears stale', async () => {
    const task = await survey();
    await ageTask(task.id, 5);
    expect((await survey()).stale).toBe(true);
    await tick(admin, task, task.checklist[1]?.key ?? '', true);
    expect((await survey()).stale).toBe(false);
  });

  it('refuses a key that is not on the checklist', async () => {
    expect((await tick(admin, await survey(), 'not_a_checklist_item', true)).status).toBe(400);
  });

  it('refuses someone who does not work the task', async () => {
    const sales = await Session.password(staffEmail('sales'), TEAM_PASSWORD);
    const task = await survey();
    expect((await tick(sales, task, task.checklist[0]?.key ?? '', true)).status).toBe(403);
  });

  it('a finished task cannot be ticked', async () => {
    const task = await survey();
    const facts = await surveyFacts(admin, await project(admin, sale.project.id), task);
    await workTask(admin, task, { facts });
    expect((await tick(admin, task, task.checklist[0]?.key ?? '', false)).status).toBe(409);
  });
});
