import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { markDone, offerOf, setNotify, stepAsks, taskIdOf } from '../support/journey-steps';
import { milestoneOf, recordPayment } from '../support/money';
import { choices, lastReply, say, tap } from '../support/onboarding';
import { type Sale, sellProject } from '../support/sales';
import { closeChat, openChat, sendTo } from '../support/send';
import { advanceTo, completeThrough, project } from '../support/tasks';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// "Did ₹X subsidy reach your bank account?" (redesign §4 Subsidy): asked by itself when the release
// step is done, or by staff; Yes records it; Not yet waits the days set in Settings, then the owner is
// told; Home keeps the question with [It has arrived].

async function release(admin: Session, sale: Sale) {
  const accounts = await Session.password(staffEmail('accounts'), TEAM_PASSWORD);
  await recordPayment(
    accounts,
    sale.project.id,
    milestoneOf(sale.project, 'quotation_accepted'),
    'bank_transfer',
  );
  await advanceTo(admin, sale.project.id, 'testing_commissioning');
  const detail = await project(admin, sale.project.id);
  await recordPayment(accounts, detail.id, milestoneOf(detail, 'material_dispatch'), 'upi');
  await completeThrough(admin, sale.project.id, 'subsidy_release');
}

describe('Journey: did the subsidy reach your bank?', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('goes by itself when the release step is done; Yes records it; Not yet waits, then the owner is told', {
    timeout: 300_000,
  }, async () => {
    const sale = await sellProject(admin, { name: 'Subsidy Credit (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    await release(admin, sale);
    const [ask] = await stepAsks(customer.customerId, 'subsidy_credit');
    expect(ask?.status).toBe('open');
    expect(ask?.payload.amountPaise).toBe(sale.quotation.subsidyPaise);
    const question = await lastReply(customer.phone);
    expect(question?.body).toMatch(
      /^Did the \*₹[\d,]+\* subsidy for .+ reach your bank account\?$/,
    );
    expect(question?.buttons?.map((button) => button.title)).toEqual(['Yes, received', 'Not yet']);
    // Only one question per step.
    expect(await stepAsks(customer.customerId, 'subsidy_credit')).toHaveLength(1);

    // Not yet: the ask stays open with [It has arrived]; nobody is alerted yet; Home shows it.
    await tap(customer.phone, question?.buttons?.[1]?.id ?? '');
    expect((await stepAsks(customer.customerId, 'subsidy_credit'))[0]).toMatchObject({
      status: 'open',
      payload: expect.objectContaining({ answer: 'not_yet' }),
    });
    expect((await lastReply(customer.phone))?.buttons?.map((button) => button.title)).toEqual([
      'It has arrived',
    ]);
    await say(customer.phone, 'hi');
    let home = await lastReply(customer.phone);
    if (choices(home).includes('go:see')) {
      await tap(customer.phone, 'go:see');
      home = await lastReply(customer.phone);
    }
    expect(choices(home)).toContain(`stp:now:${ask?.id}`);

    // The owner hears only after the days set in Settings (15 by default), once.
    const db = acceptanceDb().db;
    const said = (days: number) =>
      rows(
        "UPDATE customer_actions SET payload = jsonb_set(payload, '{answeredAt}', to_jsonb($2::text)) WHERE id = $1",
        [ask?.id, new Date(Date.now() - days * 86_400_000).toISOString()],
      );
    const alerts = () =>
      rows(
        "SELECT title FROM notifications WHERE kind = 'subsidy_not_received' AND dedupe_key LIKE $1",
        [`%${ask?.id}%`],
      );
    await said(14);
    await queueActionReminders(db, new Date(), 'Asia/Kolkata');
    expect(await alerts()).toHaveLength(0);
    await said(16);
    await queueActionReminders(db, new Date(), 'Asia/Kolkata');
    await queueActionReminders(db, new Date(), 'Asia/Kolkata');
    const [alert] = await alerts();
    expect(alert?.title).toMatch(/says the subsidy has not reached them$/);
    expect(await alerts()).toHaveLength(1);
    // No second customer reminder was queued for the waiting ask.
    expect(
      (await outboxFor(customer.phone)).filter((row) =>
        row.dedupe_key.startsWith('action_reminder:'),
      ),
    ).toHaveLength(0);

    // It arrives: closed, the project fact is set, the owner is told.
    await tap(customer.phone, `stp:now:${ask?.id}`);
    expect((await stepAsks(customer.customerId, 'subsidy_credit'))[0]?.status).toBe('closed');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^Thank you ✅ We are glad the subsidy reached you\./,
    );
    const [fact] = await rows(
      "SELECT 1 FROM project_facts WHERE project_id = $1 AND key = 'subsidy_received'",
      [sale.project.id],
    );
    expect(fact).toBeDefined();
  });

  it('the chosen days are the owner setting: 3 days alerts at 4', async () => {
    const sale = await sellProject(admin, { name: 'Subsidy Days (test)' });
    const { customer } = sale;
    const releaseId = await taskIdOf(sale, 'subsidy_release');
    await markDone(releaseId);
    await openChat(customer.phone, customer.customerId);
    const offers = await offerOf(
      admin,
      { taskId: releaseId, projectId: sale.project.id },
      'ask_subsidy_credit',
    );
    if (!offers[0]?.request) throw new Error('No credit offer.');
    await sendTo(admin, { taskId: releaseId }, offers[0].request);
    const [ask] = await stepAsks(customer.customerId, 'subsidy_credit');
    await tap(customer.phone, `stp:alt:${ask?.id}`);
    const settings = await admin.get<Record<string, unknown>>('/settings/reminders');
    await admin.put('/settings/reminders', { ...settings, subsidyChaseDays: 3 });
    try {
      await rows(
        "UPDATE customer_actions SET payload = jsonb_set(payload, '{answeredAt}', to_jsonb($2::text)) WHERE id = $1",
        [ask?.id, new Date(Date.now() - 4 * 86_400_000).toISOString()],
      );
      await queueActionReminders(acceptanceDb().db, new Date(), 'Asia/Kolkata');
      const [alert] = await rows(
        "SELECT 1 FROM notifications WHERE kind = 'subsidy_not_received' AND dedupe_key LIKE $1",
        [`%${ask?.id}%`],
      );
      expect(alert).toBeDefined();
    } finally {
      await admin.put('/settings/reminders', settings);
    }
  });

  it('staff can ask once the step is done; Yes (from the template, window closed) records it; cancel tells the customer', async () => {
    const sale = await sellProject(admin, { name: 'Subsidy Staff (test)' });
    const { customer } = sale;
    const releaseId = await taskIdOf(sale, 'subsidy_release');
    const scope = { taskId: releaseId, projectId: sale.project.id };
    // Not offered before the step is done, and refused.
    await setNotify(sale, 'subsidy_release', true);
    expect(await offerOf(admin, scope, 'ask_subsidy_credit')).toHaveLength(0);
    const early = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId: releaseId },
      request: { action: 'ask_subsidy_credit', taskId: releaseId },
    });
    expect(early.status).toBe(409);
    await markDone(releaseId);
    await closeChat(customer.phone);
    const [offer] = await offerOf(admin, scope, 'ask_subsidy_credit');
    expect(offer?.preview?.buttons).toEqual(['Yes, received', 'Not yet']);
    if (!offer?.request) throw new Error('No credit offer.');
    expect((await sendTo(admin, { taskId: releaseId }, offer.request)).via).toBe('template');
    const [row] = (await outboxFor(customer.phone)).filter(
      (one) => one.template === 'subsidy_credit_check',
    );
    expect(row?.payload.amount).toMatch(/^₹[\d,]+$/);
    expect(row?.payload.yesPayload).toMatch(/^stp:ok:/);
    // The template's Yes opens the chat and records it.
    await tap(customer.phone, row?.payload.yesPayload ?? '');
    expect((await stepAsks(customer.customerId, 'subsidy_credit'))[0]?.status).toBe('closed');
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'subsidy_received' AND subject_id = $1",
      [releaseId],
    );
    expect(alert).toBeDefined();

    // A fresh sale: asked, then cancelled by the team; the customer hears.
    const other = await sellProject(admin, { name: 'Subsidy Cancel (test)' });
    const otherTask = await taskIdOf(other, 'subsidy_release');
    await setNotify(other, 'subsidy_release', true);
    await markDone(otherTask);
    await openChat(other.customer.phone, other.customer.customerId);
    const [again] = await offerOf(
      admin,
      { taskId: otherTask, projectId: other.project.id },
      'ask_subsidy_credit',
    );
    if (!again?.request) throw new Error('No credit offer.');
    await sendTo(admin, { taskId: otherTask }, again.request);
    const [open] = await stepAsks(other.customer.customerId, 'subsidy_credit');
    await admin.post(`/document-requests/${open?.id}/cancel`);
    expect((await stepAsks(other.customer.customerId, 'subsidy_credit'))[0]?.status).toBe(
      'cancelled',
    );
    expect((await lastReply(other.customer.phone))?.body).toMatch(
      /You do not need to tell us about the subsidy any more/,
    );
  });

  it('a release step that may not message customers asks nothing by itself (PRD rule)', {
    timeout: 300_000,
  }, async () => {
    const sale = await sellProject(admin, { name: 'Subsidy Quiet (test)' });
    await setNotify(sale, 'subsidy_release', false);
    await openChat(sale.customer.phone, sale.customer.customerId);
    await release(admin, sale);
    expect(await stepAsks(sale.customer.customerId, 'subsidy_credit')).toHaveLength(0);
  });
});
