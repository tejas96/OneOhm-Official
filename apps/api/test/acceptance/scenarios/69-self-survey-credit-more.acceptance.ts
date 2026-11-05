import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyPendingCredit } from '../../../src/modules/self-survey/survey-credit';
import { reverseCredit, settleByHand } from '../../../src/modules/self-survey/survey-credit-hand';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { credits, offerSurvey, sendWholeSurvey, surveyTask } from '../support/self-survey';
import { openChat, optionsOf } from '../support/send';
import { project, surveyFacts, taskByKey, workTask } from '../support/tasks';

// The discount is earned once per project, never lost and never promised vaguely (redesign §7):
// two surveys or two completions give one credit; with no upcoming payment it waits for finance.

describe('Self survey: settling, words, other survey steps', () => {
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

  it('a settlement and an automatic application at the same moment give the discount once', async () => {
    const { sale } = await received('Survey Settle Race (test)');
    await rows(
      "UPDATE payment_milestones SET status = 'due', due_at = now() WHERE project_id = $1 AND status = 'upcoming'",
      [sale.project.id],
    );
    await finish(sale, true);
    const [pending] = await credits(sale.project.id);
    expect(pending?.status).toBe('pending');
    const [creditRow] = await rows<{ id: string }>(
      'SELECT id FROM milestone_credits WHERE project_id = $1',
      [sale.project.id],
    );
    const [last] = await rows<{ id: string; amount: number }>(
      `UPDATE payment_milestones SET status = 'upcoming', due_at = NULL
        WHERE id = (SELECT id FROM payment_milestones WHERE project_id = $1 AND payer = 'customer' ORDER BY position DESC LIMIT 1)
        RETURNING id, amount_paise::bigint::int AS amount`,
      [sale.project.id],
    );
    await Promise.all([
      tx((trx) => applyPendingCredit(trx, sale.project.id, admin.userId)),
      tx((trx) =>
        settleByHand(trx, {
          creditId: creditRow?.id ?? '',
          userId: admin.userId,
          reason: 'Cheque (test)',
        }),
      ),
    ]);
    const [after] = await credits(sale.project.id);
    const [moved] = await rows<{ amount: number }>(
      'SELECT amount_paise::bigint::int AS amount FROM payment_milestones WHERE id = $1',
      [last?.id],
    );
    expect(['applied', 'paid_out']).toContain(after?.status);
    expect(moved?.amount).toBe(
      after?.status === 'applied' ? (last?.amount ?? 0) - 100_000 : last?.amount,
    );
  });

  it('dropping a pending credit marks its finance alert read', async () => {
    const { sale } = await received('Survey Drop Pending (test)');
    await rows(
      "UPDATE payment_milestones SET status = 'due', due_at = now() WHERE project_id = $1 AND status = 'upcoming'",
      [sale.project.id],
    );
    await finish(sale, true);
    const unread = () =>
      rows(
        "SELECT 1 FROM notifications WHERE kind = 'credit_pending' AND project_id = $1 AND read_at IS NULL",
        [sale.project.id],
      );
    expect((await unread()).length).toBeGreaterThan(0);
    const done = await tx<{ kind: string }>((trx) =>
      reverseCredit(trx, { projectId: sale.project.id, userId: admin.userId, reason: 'test' }),
    );
    expect(done.kind).toBe('reversed');
    expect(await unread()).toEqual([]);
  });

  it('the customer reads the payment in their own language (Marathi)', async () => {
    const sale = await sellProject(admin, { name: 'Survey Marathi Words (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    await tap(sale.customer.phone, 'lang:mr');
    const { ask } = await offerSurvey(admin, sale);
    await sendWholeSurvey(sale.customer.phone, sale, ask.id);
    await finish(sale, true);
    expect((await lastReply(sale.customer.phone))?.body).toBe(
      'सर्वे मंजूर ✅ तुमच्या पेमेंटमध्ये (साहित्य पाठवण्यापूर्वी) ₹1,000 सूट.',
    );
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
