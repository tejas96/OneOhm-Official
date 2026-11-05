import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { logLines, NOON, setNotify, stepAsks } from '../support/journey-steps';
import { lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { openChat, optionsOf, sendTo } from '../support/send';

// Subsidy registration help (redesign §4 Subsidy, §18 15): "Please register on the PM Surya Ghar
// portal" with [Done] [Need help]; reminders at 2 days, the asker at 4; cancel tells the customer;
// the bank passbook is the existing paper ask on the subsidy checklist row.

describe('Journey: PM Surya Ghar registration', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  async function asked(name: string) {
    const sale = await sellProject(admin, { name });
    const taskId = await setNotify(sale, 'subsidy_application', true);
    await openChat(sale.customer.phone, sale.customer.customerId);
    const scope = { taskId, projectId: sale.project.id };
    const offer = (await optionsOf(admin, scope)).offers.find(
      (one) => one.action === 'ask_subsidy_register',
    );
    if (!offer?.request) throw new Error('No registration offer.');
    return { sale, taskId, scope, offer, ask: async () => sendTo(admin, scope, offer.request) };
  }

  it('Done is logged on the step, closes the ask and tells the step owner', async () => {
    const { sale, taskId, offer, ask } = await asked('Register Done (test)');
    const { customer } = sale;
    expect(offer.preview?.buttons).toEqual(['Done', 'Need help']);
    expect(offer.preview?.body).toContain('pmsuryaghar.gov.in');
    expect((await ask()).via).toBe('chat');
    const [open] = await stepAsks(customer.customerId, 'subsidy_register');
    expect(open).toMatchObject({ status: 'open', task_id: taskId });
    const question = await lastReply(customer.phone);
    expect(question?.body).toMatch(
      /^Please register on the PM Surya Ghar portal for your \*.+\* solar\./,
    );
    expect(question?.body).toContain(
      'Keep your latest electricity bill ready (consumer number, electricity company) and an email ID',
    );
    expect(question?.buttons?.map((button) => button.title)).toEqual(['Done', 'Need help']);
    // Asked again while it waits: refused.
    expect(
      (await admin.raw('POST', '/send-to-customer', { scope: { taskId }, request: offer.request }))
        .status,
    ).toBe(409);

    await tap(customer.phone, question?.buttons?.[0]?.id ?? '');
    expect((await stepAsks(customer.customerId, 'subsidy_register'))[0]).toMatchObject({
      status: 'closed',
    });
    expect((await lastReply(customer.phone))?.body).toMatch(
      /^Thank you ✅ We have noted that you registered\./,
    );
    const [line] = await logLines(sale.project.id, '%registered on the PM Surya Ghar portal%');
    expect(line?.task_id).toBe(taskId);
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'subsidy_registered' AND subject_id = $1",
      [taskId],
    );
    expect(alert).toBeDefined();
    // A second tap changes nothing more.
    await tap(customer.phone, question?.buttons?.[0]?.id ?? '');
    expect((await lastReply(customer.phone))?.body).toBe(
      'That message is no longer open, so nothing has changed.',
    );
  });

  it('Need help hands the chat to a person with the reason, and closes the ask', async () => {
    const { sale, ask } = await asked('Register Help (test)');
    await ask();
    const question = await lastReply(sale.customer.phone);
    await tap(sale.customer.phone, question?.buttons?.[1]?.id ?? '');
    expect((await stepAsks(sale.customer.customerId, 'subsidy_register'))[0]?.status).toBe(
      'closed',
    );
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'whatsapp_handover' AND body LIKE '%Needs help to register on the PM Surya Ghar portal%'",
    );
    expect(alert).toBeDefined();
    expect((await lastReply(sale.customer.phone))?.body).toMatch(/We’ve passed this to/);
  });

  it('is asked again at 2 days (once), the asker is told at 4, and cancel tells the customer', async () => {
    const { sale, ask } = await asked('Register Remind (test)');
    const { customer } = sale;
    await ask();
    const [open] = await stepAsks(customer.customerId, 'subsidy_register');
    const age = (days: number) =>
      rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
        open?.id,
        new Date(NOON.getTime() - days * 86_400_000),
      ]);
    const db = acceptanceDb().db;
    await age(2.5);
    await queueActionReminders(db, NOON, 'Asia/Kolkata');
    await queueActionReminders(db, NOON, 'Asia/Kolkata');
    const reminders = (await outboxFor(customer.phone)).filter(
      (row) =>
        row.template === 'subsidy_register_help' && row.dedupe_key.startsWith('action_reminder:'),
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.payload).toMatchObject({
      donePayload: `stp:ok:${open?.id}`,
      helpPayload: `stp:alt:${open?.id}`,
    });
    await age(4.5);
    await queueActionReminders(db, NOON, 'Asia/Kolkata');
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'customer_action_waiting' AND dedupe_key LIKE $1",
      [`action_waiting:${open?.id}%`],
    );
    expect(alert).toBeDefined();

    await admin.post(`/document-requests/${open?.id}/cancel`);
    expect((await stepAsks(customer.customerId, 'subsidy_register'))[0]?.status).toBe('cancelled');
    expect((await lastReply(customer.phone))?.body).toMatch(
      /You do not need to register on the PM Surya Ghar portal/,
    );
  });

  it('a subsidy step that may not message customers offers nothing (PRD rule)', async () => {
    const sale = await sellProject(admin, { name: 'Register Quiet (test)' });
    const taskId = await setNotify(sale, 'subsidy_application', false);
    await openChat(sale.customer.phone, sale.customer.customerId);
    const offers = (await optionsOf(admin, { taskId, projectId: sale.project.id })).offers;
    expect(offers.some((one) => one.action === 'ask_subsidy_register')).toBe(false);
    const refused = await admin.raw('POST', '/send-to-customer', {
      scope: { taskId },
      request: { action: 'ask_subsidy_register', taskId },
    });
    expect(refused.status).toBe(400);
    expect(await replies(sale.customer.phone)).toHaveLength(0);
  });

  it('the bank passbook is the existing paper ask on the subsidy checklist row, asked once', async () => {
    const sale = await sellProject(admin, { name: 'Passbook (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    const body = {
      projectId: sale.project.id,
      category: 'subsidy',
      title: 'Bank passbook or cancelled cheque',
      requirementKey: 'subsidy_bank',
    };
    const first = await admin.post<{ id: string; type: string; status: string }>(
      '/document-requests',
      body,
    );
    expect(first).toMatchObject({ type: 'paper', status: 'open' });
    expect((await admin.raw('POST', '/document-requests', body)).status).toBe(409);
    // The ask carries its checklist key, so the subsidy_bank row of the checklist shows it asked.
    const [row] = await rows<{ requirement_key: string; category: string }>(
      'SELECT requirement_key, category FROM customer_actions WHERE id = $1',
      [first.id],
    );
    expect(row).toEqual({ requirement_key: 'subsidy_bank', category: 'subsidy' });
  });
});
