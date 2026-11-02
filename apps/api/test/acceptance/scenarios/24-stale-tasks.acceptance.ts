import type { ProjectTask } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ageTask, closeDb } from '../support/db';
import { Session } from '../support/http';
import { type Sale, sellProject } from '../support/sales';
import { project, sessionOf } from '../support/tasks';

// Spec 3.5: work nobody has touched for a while shows as stale, any update clears it,
// and marking a task Urgent tells the person doing it at once.
describe('Stale tasks and the Urgent notice', () => {
  let admin: Session;
  let sale: Sale;
  const taskById = async (id: string) =>
    (await project(admin, sale.project.id)).tasks.find((task) => task.id === id) as ProjectTask;

  beforeAll(async () => {
    admin = await Session.admin();
    sale = await sellProject(admin, { name: 'Stale Work (test)' });
  });
  afterAll(closeDb);

  it('a ready task untouched for 3 days is stale', async () => {
    const ready = (await project(admin, sale.project.id)).tasks.find(
      (task) => task.status === 'ready',
    ) as ProjectTask;
    expect(ready.stale).toBe(false);
    await ageTask(ready.id, 3);
    expect((await taskById(ready.id)).stale).toBe(true);
  });

  it('a note clears stale at once', async () => {
    const ready = (await project(admin, sale.project.id)).tasks.find(
      (task) => task.status === 'ready',
    ) as ProjectTask;
    await ageTask(ready.id, 5);
    expect((await taskById(ready.id)).stale).toBe(true);
    await admin.post(`/tasks/${ready.id}/updates`, { note: 'Called the customer (test).' });
    expect((await taskById(ready.id)).stale).toBe(false);
  });

  it('a task that cannot start yet is never stale', async () => {
    const blocked = (await project(admin, sale.project.id)).tasks.find(
      (task) => task.status === 'pending',
    ) as ProjectTask;
    await ageTask(blocked.id, 10);
    expect((await taskById(blocked.id)).stale).toBe(false);
  });

  it('marking urgent tells the assignee once per change to Urgent', async () => {
    const task = (await project(admin, sale.project.id)).tasks.find(
      (entry) => entry.assignee && entry.assignee.id !== admin.userId,
    ) as ProjectTask;
    const doer = await sessionOf(admin, task.assignee?.id ?? '');
    const urgentNotices = async () =>
      (
        await doer.get<{ items: { kind: string; title: string }[] }>('/me/notifications')
      ).items.filter(
        (item) => item.kind === 'task_urgent' && item.title.includes(sale.project.code),
      ).length;
    await admin.post(`/tasks/${task.id}/priority`, { priority: 'urgent' });
    await admin.post(`/tasks/${task.id}/priority`, { priority: 'urgent' });
    expect(await urgentNotices()).toBe(1);
    await admin.post(`/tasks/${task.id}/priority`, { priority: 'high' });
    await admin.post(`/tasks/${task.id}/priority`, { priority: 'urgent' });
    expect(await urgentNotices()).toBe(2);
  });
});
