import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, replies } from '../support/onboarding';
import { sellProject } from '../support/sales';
import {
  credits,
  instalments,
  offerSurvey,
  sendWholeSurvey,
  surveysOf,
  surveyTask,
} from '../support/self-survey';
import { project, surveyFacts, taskByKey, workTask } from '../support/tasks';

// The engineer's check (redesign §7): Approve is the survey step's own completion (the field survey's
// form), and it takes the offered credit off the next payment that has not fallen due: once, audited,
// undone when the review sends the survey back.

describe('Self survey: the engineer approves', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  async function received(name: string) {
    const sale = await sellProject(admin, { name });
    const { ask, taskId } = await offerSurvey(admin, sale);
    await sendWholeSurvey(sale.customer.phone, sale, ask.id);
    expect((await surveysOf(sale.customer.customerId))[0]?.status).toBe('received');
    return { sale, ask, taskId };
  }

  const finish = async (sale: Awaited<ReturnType<typeof received>>['sale'], approve: boolean) => {
    const detail = await project(admin, sale.project.id);
    const task = taskByKey(detail, 'site_survey');
    return workTask(admin, task, { facts: await surveyFacts(admin, detail, task), approve });
  };

  it('Approve completes the step, takes ₹1,000 off the next upcoming payment once and tells the customer', async () => {
    const { sale, ask, taskId } = await received('Survey Approve (test)');
    const before = await instalments(sale.project.id);
    const next = before.find((one) => one.status === 'upcoming');
    expect(next).toBeDefined();
    const done = await finish(sale, true);
    expect(done.status).toBe('completed');
    const after = await instalments(sale.project.id);
    const changed = after.filter((one, index) => one.amount !== before[index]?.amount);
    expect(changed.map((one) => one.id)).toEqual([next?.id]);
    expect((next?.amount ?? 0) - (changed[0]?.amount ?? 0)).toBe(100_000);
    expect(await credits(sale.project.id)).toMatchObject([
      { amount_paise: 100_000, reversed_at: null },
    ]);
    expect((await surveysOf(sale.customer.customerId))[0]).toMatchObject({
      id: ask.id,
      status: 'closed',
    });
    expect((await lastReply(sale.customer.phone))?.body).toBe(
      `Survey approved ✅ ₹1,000 off your payment: ${next?.label}.`,
    );
    const [line] = await rows<{ message: string }>(
      "SELECT message FROM project_activities WHERE project_id = $1 AND message LIKE 'Self survey approved%'",
      [sale.project.id],
    );
    expect(line?.message).toContain('₹1,000 taken off');
    const audit = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'milestone_credit.applied' AND data->>'actionId' = $1",
      [ask.id],
    );
    expect(audit).toHaveLength(1);
    // The consumer number the customer typed is on the home now.
    const [property] = await rows<{ consumer_number: string | null }>(
      'SELECT consumer_number FROM properties WHERE id = $1',
      [sale.customer.propertyId],
    );
    expect(property?.consumer_number).toMatch(/^MH/);
    expect(taskId).toBe(done.id);
  });

  it('is never applied twice: a second live credit for the project is refused by the database', async () => {
    const { sale } = await received('Survey Twice (test)');
    await finish(sale, true);
    const [credit] = await credits(sale.project.id);
    await expect(
      rows(
        `INSERT INTO milestone_credits (project_id, milestone_id, amount_paise, source, source_id, status)
         VALUES ($1, $2, 100000, 'self_survey', gen_random_uuid(), 'applied')`,
        [sale.project.id, credit?.milestone_id],
      ),
    ).rejects.toThrow(/milestone_credits_live_unique/);
    expect(await credits(sale.project.id)).toHaveLength(1);
  });

  it('a review that sends the survey back has taken nothing off yet; approving later takes it off once', async () => {
    const { sale, ask } = await received('Survey Back (test)');
    const before = await instalments(sale.project.id);
    const sent = await finish(sale, false);
    expect(sent.status).toBe('in_review');
    // Nothing is applied or promised before the final approval.
    expect(await instalments(sale.project.id)).toEqual(before);
    expect(await credits(sale.project.id)).toEqual([]);
    expect((await surveysOf(sale.customer.customerId))[0]).toMatchObject({
      id: ask.id,
      status: 'received',
    });
    await admin.post(`/tasks/${sent.id}/return`, { reason: 'Meter photo is blurry (test)' });
    expect(await credits(sale.project.id)).toEqual([]);
    const again = await finish(sale, true);
    expect(again.status).toBe('completed');
    expect((await credits(sale.project.id)).filter((one) => one.status === 'applied')).toHaveLength(
      1,
    );
    expect((await instalments(sale.project.id)).reduce((s, o) => s + o.amount, 0)).toBe(
      before.reduce((s, o) => s + o.amount, 0) - 100_000,
    );
  });

  it('a field survey with no self survey changes no payment', async () => {
    const sale = await sellProject(admin, { name: 'Survey Field (test)' });
    const before = await instalments(sale.project.id);
    await finish(sale, true);
    expect(await instalments(sale.project.id)).toEqual(before);
    expect(await credits(sale.project.id)).toEqual([]);
    expect(
      (await replies(sale.customer.phone)).some((r) => r.body.includes('Survey approved')),
    ).toBe(false);
    expect(await surveyTask(sale)).toBeDefined();
  });
});
