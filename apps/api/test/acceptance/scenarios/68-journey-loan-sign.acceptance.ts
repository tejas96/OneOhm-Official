import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { NOON, saveLoan, setNotify, stepAsks } from '../support/journey-steps';
import { lastReply, replies, tap } from '../support/onboarding';
import { addDays, sellProject, today } from '../support/sales';
import { closeChat, openChat, optionsOf, sendTo } from '../support/send';

// "Please visit {bank}, {branch} on {day} to sign the loan papers" (redesign §4 Loan, §18 11):
// [I'll go] [Change day]; Change day tells the loan owner.

describe('Journey: sign the loan papers at the bank', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const day = addDays(today(), 2);
  const request = (projectId: string, over: Record<string, unknown> = {}) =>
    ({ action: 'ask_bank_sign', projectId, branch: 'Sangli main branch', day, ...over }) as const;

  async function sale(name: string) {
    const made = await sellProject(admin, { name, loan: true });
    await saveLoan(admin, made);
    return made;
  }

  it('the menu asks for the branch and the day, then sends the question; I will go closes it', async () => {
    const made = await sale('Bank Go (test)');
    const { customer, project } = made;
    await openChat(customer.phone, customer.customerId);
    const [offer] = (await optionsOf(admin, { projectId: project.id })).offers.filter(
      (one) => one.action === 'ask_bank_sign',
    );
    expect(offer).toMatchObject({ input: 'bank_visit', request: null });
    // A day in the past, or no branch, is refused.
    for (const bad of [{ day: addDays(today(), -1) }, { branch: ' ' }]) {
      const refused = await admin.raw('POST', '/send-to-customer', {
        scope: { projectId: project.id },
        request: request(project.id, bad),
      });
      expect(refused.status).toBe(400);
    }
    const preview = await admin.post<{ body: string; buttons: string[] }>(
      '/send-to-customer/preview',
      {
        scope: { projectId: project.id },
        request: request(project.id),
      },
    );
    expect(preview.buttons).toEqual(["I'll go", 'Change day']);
    await sendTo(admin, { projectId: project.id }, request(project.id));
    const question = await lastReply(customer.phone);
    expect(question?.body).toMatch(
      /^Please visit \*HDFC Bank \(test\), Sangli main branch\* on \*.+\* to sign the loan papers\.$/,
    );
    expect(question?.buttons?.map((button) => button.title)).toEqual(["I'll go", 'Change day']);
    const [ask] = await stepAsks(customer.customerId, 'bank_sign');
    expect(ask?.payload).toMatchObject({
      bank: 'HDFC Bank (test)',
      branch: 'Sangli main branch',
      day,
    });
    // Asked again while it waits: refused.
    expect(
      (
        await admin.raw('POST', '/send-to-customer', {
          scope: { projectId: project.id },
          request: request(project.id),
        })
      ).status,
    ).toBe(409);

    await tap(customer.phone, question?.buttons?.[0]?.id ?? '');
    expect((await stepAsks(customer.customerId, 'bank_sign'))[0]?.status).toBe('closed');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^Thank you ✅ We have noted that you will go on /,
    );
    const [line] = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND message LIKE '%will go to HDFC Bank (test), Sangli main branch%'",
      [project.id],
    );
    expect(line).toBeDefined();
  });

  it('Change day tells the loan owner and closes the ask', async () => {
    const made = await sale('Bank Change (test)');
    const { customer, project } = made;
    await openChat(customer.phone, customer.customerId);
    await sendTo(admin, { projectId: project.id }, request(project.id));
    const question = await lastReply(customer.phone);
    await tap(customer.phone, question?.buttons?.[1]?.id ?? '');
    expect((await stepAsks(customer.customerId, 'bank_sign'))[0]).toMatchObject({
      status: 'closed',
      payload: expect.objectContaining({ answer: 'change' }),
    });
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^No problem — we have told our team\./,
    );
    const [alert] = await rows<{ title: string }>(
      "SELECT title FROM notifications WHERE kind = 'bank_sign_change' AND subject_type = 'task'",
    );
    expect(alert?.title).toMatch(/cannot go to HDFC Bank \(test\) on /);
  });

  it('with the chat closed the approved template goes; it is asked again at 2 days; cancel tells the customer', async () => {
    const made = await sale('Bank Shut (test)');
    const { customer, project } = made;
    await closeChat(customer.phone);
    expect((await sendTo(admin, { projectId: project.id }, request(project.id))).via).toBe(
      'template',
    );
    const [row] = (await outboxFor(customer.phone)).filter(
      (one) => one.template === 'bank_sign_visit',
    );
    expect(row?.payload).toMatchObject({ bank: 'HDFC Bank (test)', branch: 'Sangli main branch' });
    const [ask] = await stepAsks(customer.customerId, 'bank_sign');
    expect(row?.payload.goPayload).toBe(`stp:ok:${ask?.id}`);
    expect(row?.payload.changePayload).toBe(`stp:alt:${ask?.id}`);

    await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(NOON.getTime() - 2.5 * 86_400_000),
    ]);
    await queueActionReminders(acceptanceDb().db, NOON, 'Asia/Kolkata');
    const again = (await outboxFor(customer.phone)).filter(
      (one) => one.template === 'bank_sign_visit' && one.dedupe_key.startsWith('action_reminder:'),
    );
    expect(again).toHaveLength(1);

    await openChat(customer.phone, customer.customerId);
    await admin.post(`/document-requests/${ask?.id}/cancel`);
    expect((await stepAsks(customer.customerId, 'bank_sign'))[0]?.status).toBe('cancelled');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /You do not need to visit the bank on that day any more/,
    );
  });

  it('a loan step that may not message customers offers nothing (PRD rule)', async () => {
    const made = await sale('Bank Quiet (test)');
    await setNotify(made, 'loan_approval', false);
    await openChat(made.customer.phone, made.customer.customerId);
    expect(
      (await optionsOf(admin, { projectId: made.project.id })).offers.some(
        (one) => one.action === 'ask_bank_sign',
      ),
    ).toBe(false);
    const refused = await admin.raw('POST', '/send-to-customer', {
      scope: { projectId: made.project.id },
      request: request(made.project.id),
    });
    expect(refused.status).toBe(400);
    expect(await replies(made.customer.phone)).toHaveLength(0);
  });
});
