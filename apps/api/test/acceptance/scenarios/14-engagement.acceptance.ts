import type { CustomerStageCard, PointsEntry, PointsStanding } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { addDays, type Sale, sellProject, today } from '../support/sales';
import { project, surveyFacts, taskByKey, workTask } from '../support/tasks';

// PRD 13 "Engagement": points and rewards reflect verified performance. On-time work earns
// points once it is verified (approval tasks only after approval), late work earns none
// and loses none, customer praise waits for a manager, and delays caused by the customer,
// bank or DISCOM are never counted against the person.
interface TeamRow {
  userId: string;
  finished: number;
  onTime: number;
  late: number;
  lateOnOthers: number;
  onTimeRate: number | null;
  open: number;
  pastDue: number;
}

describe('Engagement', () => {
  let admin: Session;
  let doer: OwnPerson;
  let me: Session;
  let onTime: Sale;
  let late: Sale;
  const mine = async (status?: string) =>
    (await admin.get<PointsEntry[]>(`/points${status ? `?status=${status}` : ''}`)).filter(
      (entry) => entry.user.id === doer.id,
    );
  const assign = async (sale: Sale, key: string) => {
    const task = taskByKey(await project(admin, sale.project.id), key);
    await admin.post(`/tasks/${task.id}/assign`, { userId: doer.id });
    return taskByKey(await project(admin, sale.project.id), key);
  };

  beforeAll(async () => {
    admin = await Session.admin();
    doer = await ownPerson(admin, 'Esha Engaged (test)');
    me = await Session.code(doer.phone);
    onTime = await sellProject(admin, { name: 'On Time Customer (test)' });
    // Started three weeks ago: every task on it is already past its due date.
    late = await sellProject(admin, {
      name: 'Late Customer (test)',
      project: { startDate: addDays(today(), -21) },
    });
  });
  afterAll(async () => {
    await retire(admin, [doer]);
  });

  it('awards on-time points for finished work, once', async () => {
    const bill = await assign(onTime, 'electricity_details');
    expect(bill.dueDate >= today()).toBe(true);
    expect((await workTask(admin, bill, { as: me })).status).toBe('completed');
    const points = (await mine()).filter((entry) => entry.sourceType === 'task_on_time');
    expect(points).toHaveLength(1);
    expect(points[0]?.points).toBe(10);
    expect(points[0]?.reason).toContain(bill.title);
  });

  it('awards nothing for approval work until it is verified', async () => {
    const survey = await assign(onTime, 'site_survey');
    const facts = await surveyFacts(admin, await project(admin, onTime.project.id), survey);
    const sent = await workTask(admin, survey, { as: me, facts, approve: false });
    expect(sent.status).toBe('in_review');
    expect((await mine()).filter((e) => e.reason.includes(survey.title))).toHaveLength(0);
    await admin.post(`/tasks/${survey.id}/approve`);
    expect((await mine()).filter((e) => e.reason.includes(survey.title))).toHaveLength(1);
  });

  it('gives late work no points and takes none away', async () => {
    const bill = await assign(late, 'electricity_details');
    expect(bill.dueDate < today()).toBe(true);
    await workTask(admin, bill, { as: me });
    // Late because the customer kept the roof locked: still no points, but not their fault.
    const survey = await assign(late, 'site_survey');
    await me.post(`/tasks/${survey.id}/start`);
    await me.post(`/tasks/${survey.id}/waiting`, { party: 'customer', note: 'Roof locked (test)' });
    const facts = await surveyFacts(admin, await project(admin, late.project.id), survey);
    const waited = taskByKey(await project(admin, late.project.id), 'site_survey');
    expect((await workTask(admin, waited, { as: me, facts })).status).toBe('completed');
    const entries = await mine();
    expect(entries.filter((entry) => entry.sourceType === 'task_on_time')).toHaveLength(2);
    expect(entries.every((entry) => entry.points > 0)).toBe(true);
  });

  it('does not count customer, bank or DISCOM delays against the person', async () => {
    // Open and past due, but paused on the DISCOM: not "behind".
    const other = await sellProject(admin, {
      name: 'Waiting Customer (test)',
      project: { startDate: addDays(today(), -21) },
    });
    const bill = await assign(other, 'electricity_details');
    await me.post(`/tasks/${bill.id}/start`);
    await me.post(`/tasks/${bill.id}/waiting`, {
      party: 'discom',
      note: 'MSEDCL has not sent the bill history (test)',
    });

    const report = await admin.get<{ people: TeamRow[] }>('/business-reports/team');
    const row = report.people.find((person) => person.userId === doer.id);
    expect(row).toMatchObject({ finished: 4, onTime: 2, late: 2, lateOnOthers: 1, open: 1 });
    // Only the one late task that was nobody else's fault lowers the rate: 2 of 3.
    expect(row?.onTimeRate).toBeCloseTo(2 / 3, 3);
    expect(row?.pastDue).toBe(0);
  });

  it('turns customer praise into points only after a manager approves them', async () => {
    const customer = await Session.code(onTime.customer.phone, 'customer');
    const cards = await customer.get<CustomerStageCard[]>('/customer/stage-ratings');
    const card = cards.find((c) => c.projectId === onTime.project.id && c.stage === 'survey');
    expect(card?.people.map((person) => person.userId)).toContain(doer.id);
    await customer.post('/customer/stage-ratings', {
      projectId: onTime.project.id,
      stage: 'survey',
      rating: 5,
      comment: 'Esha explained everything (test)',
      people: [{ userId: doer.id, rating: 5 }],
    });
    const [pending] = (await mine('pending')).filter((e) => e.sourceType === 'stage_rating');
    expect(pending?.status).toBe('pending');
    const before = await admin.get<PointsStanding[]>('/points/standings');
    const totalBefore = before.find((s) => s.user.id === doer.id)?.total ?? 0;

    const decided = await admin.post<PointsEntry>(`/points/${pending?.id}/decide`, {
      approve: true,
    });
    expect(decided.status).toBe('approved');
    const after = await admin.get<PointsStanding[]>('/points/standings');
    expect(after.find((s) => s.user.id === doer.id)?.total).toBe(
      totalBefore + (pending?.points ?? 0),
    );
  });
});
