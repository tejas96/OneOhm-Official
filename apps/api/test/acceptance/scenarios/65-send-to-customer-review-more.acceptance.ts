import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { milestoneOf } from '../support/money';
import { replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { actionsOf, openChat, sendTo } from '../support/send';
import { sendInbound } from '../support/whatsapp';

// Review round 2: the quick-reply switch, a cancelled payment ask says the payment is still due, a pin in a
// held chat with 2 homes, a phone-only lead's call, and an overdue follow-up that blocks nothing.

describe('Send to customer: review round 2', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('the newer quick reply has its own switch, off by default', async () => {
    const list = await admin.get<{ key: string; quickRepliesApproved: boolean }[]>(
      '/settings/message-templates',
    );
    for (const key of ['payment_reminder', 'payment_link'])
      expect(list.find((one) => one.key === key)?.quickRepliesApproved, key).toBe(false);
  });

  it('cancelling a payment ask says in the app that the payment is still due', async () => {
    const sale = await sellProject(admin, { name: 'Round2 Cancel (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    await sendTo(
      admin,
      { projectId: sale.project.id },
      {
        action: 'ask_payment_proof',
        milestoneId: milestoneOf(sale.project, 'quotation_accepted').id,
      },
    );
    const [pay] = await actionsOf(sale.customer.customerId, 'pay');
    await admin.post(`/document-requests/${pay?.id}/cancel`);
    const [notice] = await rows<{ body: string }>(
      "SELECT body FROM notifications WHERE kind = 'action_cancelled' AND customer_id = $1",
      [sale.customer.customerId],
    );
    expect(notice?.body).toBe('Your payment is still due.');
  });

  it('a pin in a held chat with 2 homes is parked and the person told, with no list sent', async () => {
    const sale = await sellProject(admin, { name: 'Round2 Held (test)' });
    await anotherHome(admin, sale.customer, 'Farm (test)');
    await openChat(sale.customer.phone, sale.customer.customerId);
    await rows("UPDATE wa_conversations SET state = 'human' WHERE phone = $1", [
      sale.customer.phone,
    ]);
    // Held, with 2 homes and nothing asked: left to the person (nothing parked, no list).
    await sendInbound(sale.customer.phone, { location: { latitude: 16.1, longitude: 74.1 } });
    expect((await replies(sale.customer.phone)).some((reply) => reply.kind === 'list')).toBe(false);
    // Asked for both homes: a pin is parked, still no list.
    await sendTo(
      admin,
      { customerId: sale.customer.customerId },
      { action: 'ask_location', propertyId: sale.customer.propertyId },
    );
    const farm = await rows<{ id: string }>(
      "SELECT id FROM properties WHERE customer_id = $1 AND label = 'Farm (test)'",
      [sale.customer.customerId],
    );
    await sendTo(
      admin,
      { customerId: sale.customer.customerId },
      { action: 'ask_location', propertyId: farm[0]?.id ?? '' },
    );
    await sendInbound(sale.customer.phone, { location: { latitude: 16.2, longitude: 74.2 } });
    expect((await replies(sale.customer.phone)).some((reply) => reply.kind === 'list')).toBe(false);
    const [parked] = await rows(
      "SELECT 1 FROM customer_actions WHERE customer_id = $1 AND type = 'location' AND status = 'open' AND property_id IS NULL",
      [sale.customer.customerId],
    );
    expect(parked).toBeDefined();
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'location_home_waiting' AND body LIKE '%you have the chat%' LIMIT 1",
    );
    expect(alert).toBeDefined();
  });

  it('a logged call closes To call for a lead not linked to the customer yet; an overdue follow-up blocks nothing', async () => {
    const sale = await sellProject(admin, { name: 'Round2 Lead (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    // The lead knows the customer by phone only, and its follow-up is days overdue.
    await rows(
      "UPDATE leads SET stage = 'new', customer_id = NULL, next_action_on = current_date - 3, next_action_time = '08:00' WHERE id = $1",
      [customer.leadId],
    );
    await sendTo(admin, { projectId: sale.project.id }, { action: 'ask_callback' });
    const [ask] = await actionsOf(customer.customerId, 'callback');
    await tap(customer.phone, `cb:${ask?.id}:evening`);
    const [lead] = await rows<{ time: string; on_today_or_later: boolean }>(
      'SELECT next_action_time AS time, next_action_on >= current_date AS on_today_or_later FROM leads WHERE id = $1',
      [customer.leadId],
    );
    expect(lead).toMatchObject({ time: '17:30', on_today_or_later: true });
    expect((await actionsOf(customer.customerId, 'callback'))[0]?.status).toBe('received');
    await admin.post(`/leads/${customer.leadId}/activities`, { kind: 'call', note: 'Called' });
    expect((await actionsOf(customer.customerId, 'callback'))[0]?.status).toBe('closed');
  });
});
