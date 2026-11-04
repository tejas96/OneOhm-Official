import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { closeChat, openChat, optionsOf, sendTo, templatesFor } from '../support/send';

// The delay notice (only when the task allows customer messages) and the "Asked from the customer"
// card with cancel telling the customer (redesign §2.3, §18, §21a).

describe('Send to customer: delay notice and the card', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('delay notice: offered only for a waiting task whose template allows customer messages', async () => {
    const sale = await sellProject(admin, { name: 'Menu Delay (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const [task] = await rows<{ id: string; title: string }>(
      'SELECT id, title FROM project_tasks WHERE project_id = $1 ORDER BY position LIMIT 1',
      [sale.project.id],
    );
    const scope = { taskId: task?.id ?? '' };
    const delay = async () =>
      (await optionsOf(admin, scope)).offers.filter((one) => one.action === 'delay_notice');
    expect(await delay()).toHaveLength(0);
    await rows(
      "UPDATE project_tasks SET status = 'waiting', waiting_party = 'discom', notify_customer = false WHERE id = $1",
      [task?.id],
    );
    expect(await delay()).toHaveLength(0);
    const refused = await admin.raw('POST', '/send-to-customer', {
      scope,
      request: { action: 'delay_notice', taskId: task?.id, reason: 'Waiting for the board' },
    });
    expect(refused.status).toBe(400);
    await rows('UPDATE project_tasks SET notify_customer = true WHERE id = $1', [task?.id]);
    const [offer] = await delay();
    expect(offer).toMatchObject({ input: 'reason', request: null });
    const request = {
      action: 'delay_notice',
      taskId: task?.id ?? '',
      reason: 'The electricity board has our papers.',
    } as const;
    const preview = await admin.post<{ body: string }>('/send-to-customer/preview', {
      scope,
      request,
    });
    expect(preview.body).toMatch(
      /^Your \*.+\* is waiting: The electricity board has our papers\. We'll update you\.$/,
    );
    await sendTo(admin, scope, request);
    expect((await lastReply(customer.phone))?.body).toBe(preview.body);
    const [log] = await rows(
      "SELECT 1 FROM project_activities WHERE project_id = $1 AND kind = 'customer_action' AND message LIKE 'Told the customer why%'",
      [sale.project.id],
    );
    expect(log).toBeDefined();
    await closeChat(customer.phone);
    expect((await sendTo(admin, scope, request)).via).toBe('template');
    expect((await templatesFor(customer.phone, 'delay_notice')).at(-1)?.payload).toMatchObject({
      reason: 'The electricity board has our papers',
    });
  });

  it('"Asked from the customer" lists location, payment and call-back asks, and cancel tells the customer', async () => {
    const sale = await sellProject(admin, { name: 'Menu Card (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const scope = { projectId: sale.project.id };
    const [reminder] = (await optionsOf(admin, scope)).offers.filter(
      (one) => one.action === 'payment_reminder',
    );
    if (!reminder?.request) throw new Error('no reminder');
    await sendTo(admin, scope, reminder.request);
    await sendTo(admin, scope, { action: 'ask_callback' });
    await sendTo(admin, scope, { action: 'ask_location', propertyId: customer.propertyId });
    const card = await admin.get<{ id: string; type: string; status: string; title: string }[]>(
      `/document-requests?projectId=${sale.project.id}`,
    );
    expect(card.map((one) => one.type).sort()).toEqual(['callback', 'location', 'pay']);
    const pay = card.find((one) => one.type === 'pay');
    await admin.post(`/document-requests/${pay?.id}/cancel`);
    expect((await lastReply(customer.phone))?.body).toBe(
      'We are not waiting for a payment proof from you any more. Your payment is still due.',
    );
    const again = await admin.raw('POST', `/document-requests/${pay?.id}/cancel`);
    expect(again.status).toBe(409);
    const [notice] = await rows("SELECT 1 FROM notifications WHERE kind = 'action_cancelled'");
    expect(notice).toBeDefined();
  });
});
