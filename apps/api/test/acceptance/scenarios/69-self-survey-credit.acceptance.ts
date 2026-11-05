import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyCredit, applyPendingCredit } from '../../../src/modules/self-survey/survey-credit';
import { undoApproval } from '../../../src/modules/self-survey/survey-undo';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import {
  credits,
  instalments,
  offerSurvey,
  sendWholeSurvey,
  surveysOf,
  surveyTask,
} from '../support/self-survey';
import { optionsOf } from '../support/send';
import { project, surveyFacts, taskByKey, workTask } from '../support/tasks';

// The discount is earned once per project, never lost and never promised vaguely (redesign §7):
// two surveys or two completions give one credit; with no upcoming payment it waits for finance.

describe('Self survey: one discount per project, and where it goes', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  async function received(name: string) {
    const sale = await sellProject(admin, { name });
    const { ask, taskId } = await offerSurvey(admin, sale);
    await sendWholeSurvey(sale.customer.phone, sale, ask.id);
    return { sale, ask, taskId };
  }
  const finish = async (sale: Awaited<ReturnType<typeof received>>['sale'], approve: boolean) => {
    const detail = await project(admin, sale.project.id);
    const task = taskByKey(detail, 'site_survey');
    return workTask(admin, task, { facts: await surveyFacts(admin, detail, task), approve });
  };
  const tx = <T>(run: Parameters<ReturnType<typeof acceptanceDb>['db']['transaction']>[0]) =>
    acceptanceDb().db.transaction(run) as Promise<T>;

  it('while the step is in review it is not offered again; one approval, one credit', async () => {
    const { sale, taskId } = await received('Survey Once (test)');
    const sent = await finish(sale, false);
    expect(sent.status).toBe('in_review');
    // Not offered from the menu, the API or Home while it waits for review.
    expect(
      (await optionsOf(admin, { taskId })).offers.filter((o) => o.action === 'self_survey'),
    ).toEqual([]);
    const refused = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId },
      request: { action: 'self_survey', taskId },
    });
    expect(refused.status).toBe(409);
    await rows(
      "UPDATE payment_milestones SET status = 'paid' WHERE project_id = $1 AND status = 'due'",
      [sale.project.id],
    );
    await tap(sale.customer.phone, 'menu');
    expect((await lastReply(sale.customer.phone))?.body ?? '').not.toContain('site survey');
    await admin.post(`/tasks/${sent.id}/approve`);
    expect(
      (await credits(sale.project.id)).filter((one) => one.status !== 'reversed'),
    ).toHaveLength(1);
    // After approval the project had its survey: no new offer either.
    expect(
      (await optionsOf(admin, { taskId })).offers.filter((o) => o.action === 'self_survey'),
    ).toEqual([]);
  });

  it('two completions at once give one credit', async () => {
    const sale = await sellProject(admin, { name: 'Survey Race (test)' });
    const give = (actionId: string) =>
      tx((trx) =>
        applyCredit(trx, {
          projectId: sale.project.id,
          actionId,
          amountPaise: 100_000,
          userId: admin.userId,
        }),
      );
    const [one, two] = await Promise.all([give(crypto.randomUUID()), give(crypto.randomUUID())]);
    expect([one?.kind, two?.kind].sort()).toEqual(['already', 'applied']);
    expect(await credits(sale.project.id)).toHaveLength(1);
  });

  it('with no payment left to take it the credit waits: finance is told, the customer is told plainly, finance settles it', async () => {
    const { sale, ask } = await received('Survey Pending (test)');
    // Every payment has fallen due: nothing can take the discount.
    await rows(
      "UPDATE payment_milestones SET status = 'due', due_at = now() WHERE project_id = $1 AND status = 'upcoming'",
      [sale.project.id],
    );
    const before = await instalments(sale.project.id);
    await finish(sale, true);
    expect(await instalments(sale.project.id)).toEqual(before);
    expect(await credits(sale.project.id)).toMatchObject([
      { status: 'pending', milestone_id: null },
    ]);
    const [alert] = await rows<{ title: string }>(
      "SELECT title FROM notifications WHERE kind = 'credit_pending' AND dedupe_key LIKE $1",
      [`credit_pending:${sale.project.id}%`],
    );
    expect(alert?.title).toMatch(/^Give the ₹1,000 self-survey discount on /);
    expect((await lastReply(sale.customer.phone))?.body).toBe(
      'Survey approved ✅ ₹1,000 will come off your final payment.',
    );
    expect((await surveysOf(sale.customer.customerId))[0]).toMatchObject({
      id: ask.id,
      status: 'closed',
    });
    // Finance sees it on the project and settles it by hand with a reason.
    const listed = await admin.get<{ id: string; status: string }[]>(
      `/self-surveys/credits?projectId=${sale.project.id}`,
    );
    expect(listed[0]).toMatchObject({ status: 'pending' });
    expect(
      (await admin.raw('POST', `/self-surveys/credits/${listed[0]?.id}/settle`, { reason: 'x' }))
        .status,
    ).toBe(400);
    const settled = await admin.post<{ status: string; settleNote: string }>(
      `/self-surveys/credits/${listed[0]?.id}/settle`,
      { reason: 'Cheque given at handover (test)' },
    );
    expect(settled).toMatchObject({
      status: 'paid_out',
      settleNote: 'Cheque given at handover (test)',
    });
    const audit = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'milestone_credit.paid_out' AND entity_id = $1",
      [listed[0]?.id],
    );
    expect(audit).toHaveLength(1);
    expect(
      (
        await admin.raw('POST', `/self-surveys/credits/${listed[0]?.id}/settle`, {
          reason: 'again (test)',
        })
      ).status,
    ).toBe(409);
  });

  it('a pending credit is applied by itself when a payment can take it later', async () => {
    const { sale } = await received('Survey Later (test)');
    await rows(
      "UPDATE payment_milestones SET status = 'due', due_at = now() WHERE project_id = $1 AND status = 'upcoming'",
      [sale.project.id],
    );
    await finish(sale, true);
    expect(await credits(sale.project.id)).toMatchObject([{ status: 'pending' }]);
    // The final payment becomes upcoming with room (a revision, a change).
    const [last] = await rows<{ id: string; amount: number }>(
      `UPDATE payment_milestones SET status = 'upcoming', due_at = NULL
        WHERE id = (SELECT id FROM payment_milestones WHERE project_id = $1 AND payer = 'customer' ORDER BY position DESC LIMIT 1)
        RETURNING id, amount_paise::bigint::int AS amount`,
      [sale.project.id],
    );
    expect(await tx((trx) => applyPendingCredit(trx, sale.project.id, admin.userId))).toBe(true);
    expect(await credits(sale.project.id)).toMatchObject([
      { status: 'applied', milestone_id: last?.id },
    ]);
    const [after] = await rows<{ amount: number }>(
      'SELECT amount_paise::bigint::int AS amount FROM payment_milestones WHERE id = $1',
      [last?.id],
    );
    expect(after?.amount).toBe((last?.amount ?? 0) - 100_000);
    expect(await tx((trx) => applyPendingCredit(trx, sale.project.id, admin.userId))).toBe(false);
  });

  it('undoing an approval puts the discount back and tells the customer; once the payment fell due it is refused', async () => {
    const { sale } = await received('Survey Undo (test)');
    const before = await instalments(sale.project.id);
    const done = await finish(sale, true);
    const task = (
      await rows<Record<string, unknown>>('SELECT * FROM project_tasks WHERE id = $1', [done.id])
    )[0];
    const asTask = { ...task, id: done.id, projectId: sale.project.id } as never;
    const [applied] = await credits(sale.project.id);
    // Fell due: locked.
    await rows(
      'UPDATE payment_milestones SET due_at = now(), status = $2::milestone_status WHERE id = $1',
      [applied?.milestone_id, 'due'],
    );
    await expect(tx((trx) => undoApproval(trx, asTask, admin.userId))).rejects.toThrow(/fell due/);
    await rows("UPDATE payment_milestones SET due_at = NULL, status = 'upcoming' WHERE id = $1", [
      applied?.milestone_id,
    ]);
    await tx((trx) => undoApproval(trx, asTask, admin.userId));
    expect(await instalments(sale.project.id)).toEqual(before);
    expect((await credits(sale.project.id))[0]).toMatchObject({ status: 'reversed' });
    expect((await lastReply(sale.customer.phone))?.body).toBe(
      'We had to take back the ₹1,000 survey discount from your payment. We will call you to explain.',
    );
    expect((await surveysOf(sale.customer.customerId))[0]?.status).toBe('received');
  });

  it('a survey step that is not the residential rooftop one takes no self survey', async () => {
    const sale = await sellProject(admin, {
      name: 'Survey Commercial (test)',
      category: 'commercial',
    });
    const [task] = await rows<{ id: string; template_key: string }>(
      "SELECT id, template_key FROM project_tasks WHERE project_id = $1 AND template_key LIKE 'site_survey%' ORDER BY position LIMIT 1",
      [sale.project.id],
    );
    expect(task?.template_key).not.toBe('site_survey');
    expect(
      (await optionsOf(admin, { taskId: task?.id ?? '' })).offers.filter(
        (o) => o.action === 'self_survey',
      ),
    ).toEqual([]);
    expect(
      (
        await admin.raw('POST', '/send-to-customer', {
          scope: { taskId: task?.id },
          request: { action: 'self_survey', taskId: task?.id },
        })
      ).status,
    ).toBe(409);
    expect(
      await surveyTask(await sellProject(admin, { name: 'Survey Rooftop (test)' })),
    ).toBeDefined();
    expect((await replies(sale.customer.phone)).length).toBe(0);
  });
});
