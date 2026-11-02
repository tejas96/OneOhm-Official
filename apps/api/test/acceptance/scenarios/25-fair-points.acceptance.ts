import type { PointsEntry, ProjectTask } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addTaskWait, ageHandIns, ageWait, closeDb, rows, setTaskDates } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { addDays, sellProject, today } from '../support/sales';
import { project, surveyFacts, taskByKey, workTask } from '../support/tasks';

// Spec 3.7: on time is judged on the hand-in day, against a due date moved later by
// outside waits and leave; first-time right needs an approval step; a missed part
// leaves a 0-point line with its reason, and nothing ever goes negative.
describe('Fair points', () => {
  let admin: Session;
  let doer: OwnPerson;
  let me: Session;
  // By task id: every project has tasks with the same titles.
  const entriesFor = (task: ProjectTask) =>
    rows<{ sourceType: string; points: number; reason: string }>(
      `SELECT source_type AS "sourceType", points, reason FROM points_entries
       WHERE source_id = $1 AND user_id = $2 ORDER BY source_type`,
      [task.id, doer.id],
    );
  const fresh = async (name: string, key: string) => {
    const sale = await sellProject(admin, { name });
    const task = taskByKey(await project(admin, sale.project.id), key);
    await admin.post(`/tasks/${task.id}/assign`, { userId: doer.id });
    return { sale, task: taskByKey(await project(admin, sale.project.id), key) };
  };

  beforeAll(async () => {
    admin = await Session.admin();
    doer = await ownPerson(admin, 'Fiona Fair (test)');
    me = await Session.code(doer.phone);
  });
  afterAll(async () => {
    await retire(admin, [doer]);
    await closeDb();
  });

  it('earns on time and first-time right on a clean approval task', async () => {
    const { sale, task } = await fresh('Clean Work (test)', 'site_survey');
    const facts = await surveyFacts(admin, await project(admin, sale.project.id), task);
    await workTask(admin, task, { as: me, facts });
    const lines = await entriesFor(task);
    expect(lines.map((row) => [row.sourceType, row.points])).toEqual([
      ['task_first_time', 10],
      ['task_on_time', 10],
    ]);
  });

  it('a late reviewer does not cost the doer', async () => {
    const { sale, task } = await fresh('Slow Review (test)', 'site_survey');
    const facts = await surveyFacts(admin, await project(admin, sale.project.id), task);
    await workTask(admin, task, { as: me, facts, approve: false });
    // Handed in three days ago, due two days ago, approved only now.
    await ageHandIns(task.id, 3);
    await setTaskDates(task.id, { startDate: addDays(today(), -6), dueDate: addDays(today(), -2) });
    const before = taskByKey(await project(admin, sale.project.id), 'site_survey');
    expect(before.dueDate < today()).toBe(true);
    expect(before.status).toBe('in_review');
    await admin.post(`/tasks/${task.id}/approve`);
    const onTime = (await entriesFor(task)).find((row) => row.sourceType === 'task_on_time');
    expect(onTime?.points).toBe(10);
  });

  it('a bank wait keeps a late task on time, with the reason', async () => {
    const { task } = await fresh('Bank Delay (test)', 'electricity_details');
    await setTaskDates(task.id, {
      startDate: addDays(today(), -10),
      dueDate: addDays(today(), -3),
    });
    await addTaskWait(task.id, 'bank', addDays(today(), -8), addDays(today(), -4));
    await workTask(admin, task, { as: me });
    const [onTime] = await entriesFor(task);
    expect(onTime?.points).toBe(10);
    expect(onTime?.reason).toContain('5 days waiting on the bank');
  });

  it('sent back once: on time earned, first-time right missed with 0 points and a reason', async () => {
    const { sale, task } = await fresh('Sent Back (test)', 'site_survey');
    const facts = await surveyFacts(admin, await project(admin, sale.project.id), task);
    await workTask(admin, task, { as: me, facts, approve: false });
    await admin.post(`/tasks/${task.id}/return`, { reason: 'Roof photo is blurred (test)' });
    const again = taskByKey(await project(admin, sale.project.id), 'site_survey');
    await workTask(admin, again, { as: me, facts });
    const lines = await entriesFor(task);
    expect(lines.find((row) => row.sourceType === 'task_on_time')?.points).toBe(10);
    const first = lines.find((row) => row.sourceType === 'task_first_time');
    expect(first?.points).toBe(0);
    expect(first?.reason).toContain('Sent back 1 time');
  });

  it('late work leaves a 0-point line with its reason, never a minus', async () => {
    const { task } = await fresh('Late Work (test)', 'electricity_details');
    await setTaskDates(task.id, { startDate: addDays(today(), -9), dueDate: addDays(today(), -2) });
    await workTask(admin, task, { as: me });
    const [onTime] = await entriesFor(task);
    expect(onTime).toMatchObject({ sourceType: 'task_on_time', points: 0 });
    expect(onTime?.reason).toContain('Late by 2 days');
    expect((await admin.get<PointsEntry[]>('/points')).every((row) => row.points >= 0)).toBe(true);
  });

  it('a wait still open when approval work is handed in keeps it on time', async () => {
    const { sale, task } = await fresh('Handed In From Waiting (test)', 'site_survey');
    await me.post(`/tasks/${task.id}/start`);
    await me.post(`/tasks/${task.id}/waiting`, {
      party: 'bank',
      note: 'Bank visit pending (test)',
    });
    await ageWait(task.id, 6);
    await setTaskDates(task.id, { startDate: addDays(today(), -9), dueDate: addDays(today(), -2) });
    const facts = await surveyFacts(admin, await project(admin, sale.project.id), task);
    const waiting = taskByKey(await project(admin, sale.project.id), 'site_survey');
    expect(waiting.status).toBe('waiting');
    await workTask(admin, waiting, { as: me, facts });
    const onTime = (await entriesFor(task)).find((row) => row.sourceType === 'task_on_time');
    expect(onTime?.points).toBe(10);
    expect(onTime?.reason).toContain('waiting on the bank');
  });

  it('switching who it waits on keeps the first stretch', async () => {
    const { task } = await fresh('Switched Wait (test)', 'electricity_details');
    await me.post(`/tasks/${task.id}/start`);
    await me.post(`/tasks/${task.id}/waiting`, { party: 'customer', note: 'Bill copy (test)' });
    await ageWait(task.id, 4);
    await me.post(`/tasks/${task.id}/waiting`, { party: 'bank', note: 'Now the bank (test)' });
    const kept = await rows<{ party: string }>('SELECT party FROM task_waits WHERE task_id = $1', [
      task.id,
    ]);
    expect(kept.map((row) => row.party)).toEqual(['customer']);
  });

  it('days the work sat with a reviewer who sent it back do not count against the doer', async () => {
    const { sale, task } = await fresh('Slow Send Back (test)', 'site_survey');
    const facts = await surveyFacts(admin, await project(admin, sale.project.id), task);
    await workTask(admin, task, { as: me, facts, approve: false });
    // Handed in 8 days ago; the reviewer only sends it back now.
    await ageHandIns(task.id, 8);
    await setTaskDates(task.id, {
      startDate: addDays(today(), -10),
      dueDate: addDays(today(), -2),
    });
    await admin.post(`/tasks/${task.id}/return`, { reason: 'Add the roof photo (test)' });
    await workTask(admin, taskByKey(await project(admin, sale.project.id), 'site_survey'), {
      as: me,
      facts,
    });
    const onTime = (await entriesFor(task)).find((row) => row.sourceType === 'task_on_time');
    expect(onTime?.points).toBe(10);
    expect(onTime?.reason).toContain('with the reviewer');
  });

  it('send-backs before a hand-over do not count against the new holder', async () => {
    const other = await ownPerson(admin, 'Ravi Before (test)');
    const otherSession = await Session.code(other.phone);
    const { sale, task } = await fresh('Handed Over (test)', 'site_survey');
    await admin.post(`/tasks/${task.id}/assign`, { userId: other.id });
    const facts = await surveyFacts(admin, await project(admin, sale.project.id), task);
    await workTask(admin, taskByKey(await project(admin, sale.project.id), 'site_survey'), {
      as: otherSession,
      facts,
      approve: false,
    });
    await admin.post(`/tasks/${task.id}/return`, { reason: 'Wrong roof size (test)' });
    await admin.post(`/tasks/${task.id}/assign`, { userId: doer.id });
    await workTask(admin, taskByKey(await project(admin, sale.project.id), 'site_survey'), {
      as: me,
      facts,
    });
    const first = (await entriesFor(task)).find((row) => row.sourceType === 'task_first_time');
    expect(first).toMatchObject({
      points: 10,
      reason: 'First-time right: Site survey and measurements',
    });
    await retire(admin, [other]);
  });

  it('a task without approval gets only the on-time line', async () => {
    const { task } = await fresh('No Review (test)', 'electricity_details');
    await workTask(admin, task, { as: me });
    expect((await entriesFor(task)).map((row) => row.sourceType)).toEqual(['task_on_time']);
  });
});
