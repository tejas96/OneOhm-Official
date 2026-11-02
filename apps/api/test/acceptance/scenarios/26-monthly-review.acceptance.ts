import type { ProjectTask } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, movePointsToMonth, setFairPointsSince, setTaskDates } from '../support/db';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { addDays, sellProject, today } from '../support/sales';
import { project, surveyFacts, taskByKey, workTask } from '../support/tasks';

interface MonthlyRow {
  user: { id: string };
  points: number;
  tasksJudged: number;
  onTimeRate: number | null;
  firstTimeRate: number | null;
  review: { decision: string; bonusId: string | null; status: string | null } | null;
}

// Spec 3.7: the owner reviews each person once a month; money is only ever proposed here
// and still needs the usual payment approval.
describe('Monthly review', () => {
  let admin: Session;
  let doer: OwnPerson;
  let me: Session;
  const lastMonth = () => addDays(`${today().slice(0, 7)}-01`, -1).slice(0, 7);
  const rowFor = async (month: string) =>
    (await admin.get<{ rows: MonthlyRow[] }>(`/points/monthly?month=${month}`)).rows.find(
      (row) => row.user.id === doer.id,
    );

  beforeAll(async () => {
    admin = await Session.admin();
    doer = await ownPerson(admin, 'Manu Monthly (test)');
    me = await Session.code(doer.phone);
    const sale = await sellProject(admin, { name: 'Monthly Work (test)' });
    const survey = taskByKey(await project(admin, sale.project.id), 'site_survey');
    await admin.post(`/tasks/${survey.id}/assign`, { userId: doer.id });
    const facts = await surveyFacts(admin, await project(admin, sale.project.id), survey);
    await workTask(admin, taskByKey(await project(admin, sale.project.id), 'site_survey'), {
      as: me,
      facts,
    });
    await movePointsToMonth(doer.id, lastMonth());
    // The fair rules count from the start of last month in this scenario.
    await setFairPointsSince(`${lastMonth()}-01`);
  });
  it('a month before the fair rules shows points but no rates', async () => {
    await setFairPointsSince(today());
    const review = await admin.get<{ fairSince: string | null; rows: MonthlyRow[] }>(
      `/points/monthly?month=${lastMonth()}`,
    );
    const row = review.rows.find((entry) => entry.user.id === doer.id);
    expect(row).toMatchObject({
      points: 20,
      tasksJudged: 0,
      onTimeRate: null,
      firstTimeRate: null,
    });
    expect(review.fairSince).toBeTruthy();
    await setFairPointsSince(`${lastMonth()}-01`);
  });

  afterAll(async () => {
    await retire(admin, [doer]);
    await closeDb();
  });

  it('lists a person with their month and rates', async () => {
    expect(await rowFor(lastMonth())).toMatchObject({
      points: 20,
      tasksJudged: 1,
      onTimeRate: 1,
      firstTimeRate: 1,
      review: null,
    });
  });

  it("shows the person's month by project", async () => {
    const detail = await admin.get<{ projects: { code: string; lines: { points: number }[] }[] }>(
      `/points/monthly/${doer.id}?month=${lastMonth()}`,
    );
    expect(detail.projects).toHaveLength(1);
    expect(detail.projects[0]?.lines.map((line) => line.points).sort()).toEqual([10, 10]);
  });

  it('the current month cannot be decided', async () => {
    const reply = await admin.raw('POST', `/points/monthly/${doer.id}/decide`, {
      month: today().slice(0, 7),
      decision: 'none',
    });
    expect(reply.status).toBe(400);
  });

  it('nobody decides their own month', async () => {
    const reply = await admin.raw('POST', `/points/monthly/${admin.userId}/decide`, {
      month: lastMonth(),
      decision: 'none',
    });
    expect(reply.status).toBe(403);
  });

  it('deciding a bonus creates a proposed bonus and records the review', async () => {
    await admin.post(`/points/monthly/${doer.id}/decide`, {
      month: lastMonth(),
      decision: 'bonus',
      amountPaise: 100_000,
      note: 'Clean month (test)',
    });
    const row = await rowFor(lastMonth());
    expect(row?.review).toMatchObject({ decision: 'bonus', status: 'pending' });
    expect(row?.review?.bonusId).toBeTruthy();
  });

  it('the same month cannot be decided twice', async () => {
    const reply = await admin.raw('POST', `/points/monthly/${doer.id}/decide`, {
      month: lastMonth(),
      decision: 'none',
    });
    expect(reply.status).toBe(409);
  });

  it('a rejected bonus frees the month to be decided again', async () => {
    const row = await rowFor(lastMonth());
    await admin.post(`/bonuses/${row?.review?.bonusId}/decide`, {
      approve: false,
      note: 'Not this month (test)',
    });
    expect((await rowFor(lastMonth()))?.review?.status).toBe('rejected');
    await admin.post(`/points/monthly/${doer.id}/decide`, { month: lastMonth(), decision: 'none' });
    expect((await rowFor(lastMonth()))?.review?.decision).toBe('none');
  });

  it('an unknown person gives not found', async () => {
    const reply = await admin.raw(
      'POST',
      '/points/monthly/00000000-0000-4000-8000-000000000000/decide',
      {
        month: lastMonth(),
        decision: 'none',
      },
    );
    expect(reply.status).toBe(404);
  });

  it("my rewards shows this month's missed lines", async () => {
    const sale = await sellProject(admin, { name: 'Missed Line (test)' });
    const bill = taskByKey(
      await project(admin, sale.project.id),
      'electricity_details',
    ) as ProjectTask;
    await admin.post(`/tasks/${bill.id}/assign`, { userId: doer.id });
    await setTaskDates(bill.id, { startDate: addDays(today(), -9), dueDate: addDays(today(), -2) });
    await workTask(admin, taskByKey(await project(admin, sale.project.id), 'electricity_details'), {
      as: me,
    });
    const rewards = await me.get<{
      month: { tasksJudged: number; onTimeRate: number | null; missed: { reason: string }[] };
    }>('/me/rewards');
    expect(rewards.month.tasksJudged).toBe(1);
    expect(rewards.month.onTimeRate).toBe(0);
    expect(rewards.month.missed[0]?.reason).toContain('Late by 2 days');
  });
});
