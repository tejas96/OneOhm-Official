import type { ProjectTask } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addLeave, ageTask, closeDb, setTaskDates } from '../support/db';
import { Session } from '../support/http';
import { ownPerson, retire } from '../support/people';
import { addDays, type Sale, sellProject, today } from '../support/sales';
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

  it('the badge days leave out approved leave, like the morning summary', async () => {
    const quiet = await sellProject(admin, { name: 'Quiet Over Leave (test)' });
    const ready = (await project(admin, quiet.project.id)).tasks.find(
      (task) => task.status === 'ready',
    ) as ProjectTask;
    // Their own person, so this leave touches no other test.
    const holder = await ownPerson(admin, 'Lena Leave (test)');
    await admin.post(`/tasks/${ready.id}/assign`, { userId: holder.id });
    await ageTask(ready.id, 6);
    await addLeave(holder.id, addDays(today(), -3), addDays(today(), -2));
    const after = (await project(admin, quiet.project.id)).tasks.find(
      (task) => task.id === ready.id,
    );
    expect(after?.idleDays).toBe(4);
    await retire(admin, [holder]);
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

  it('a project with stale work is at risk', async () => {
    const other = await sellProject(admin, { name: 'Quiet Project (test)' });
    const ready = (await project(admin, other.project.id)).tasks.find(
      (task) => task.status === 'ready',
    ) as ProjectTask;
    await setTaskDates(ready.id, { dueDate: addDays(today(), 5) });
    await ageTask(ready.id, 4);
    expect((await project(admin, other.project.id)).toneLabel).toBe('1 task not updated');
  });

  it("the team's own late work shows before a wait on the bank", async () => {
    const other = await sellProject(admin, { name: 'Late And Waiting (test)' });
    const tasks = (await project(admin, other.project.id)).tasks;
    const ready = tasks.find((task) => task.status === 'ready') as ProjectTask;
    await admin.post(`/tasks/${ready.id}/start`);
    await admin.post(`/tasks/${ready.id}/waiting`, { party: 'bank', note: 'Loan papers (test)' });
    const late = tasks.find((task) => task.id !== ready.id) as ProjectTask;
    await setTaskDates(late.id, { dueDate: addDays(today(), -2) });
    expect((await project(admin, other.project.id)).toneLabel).toBe('1 task overdue');
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
