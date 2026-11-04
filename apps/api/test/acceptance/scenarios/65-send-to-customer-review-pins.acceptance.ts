import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionChecks } from '../../../../worker/src/activities/action-checks';
import { queuePaymentReminders } from '../../../../worker/src/activities/payment-reminders';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { milestoneOf } from '../support/money';
import { replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { actionsOf, lastOf, openChat, sendTo } from '../support/send';
import { photoAndQuestion } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// Review round 1 (continued): a pin adopts its ask, a held chat, proof answers one ask, Home asks.

const db = () => acceptanceDb().db;

describe('Send to customer: review fixes, pins and proof', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('a pin picked for a home closes the ask the team had for it; an unanswered pin alerts staff; a replaced one is audited', async () => {
    const sale = await sellProject(admin, { name: 'Review Adopt (test)' });
    const farm = await anotherHome(admin, sale.customer, 'Farm (test)');
    await openChat(sale.customer.phone, sale.customer.customerId);
    await sendInbound(sale.customer.phone, { location: { latitude: 16.5, longitude: 74.5 } });
    const list = await lastOf(sale.customer.phone, 'list');
    // The team asks for the Farm while the pin waits for its home.
    await sendTo(
      admin,
      { projectId: farm.projectId },
      { action: 'ask_location', propertyId: farm.propertyId },
    );
    await tap(
      sale.customer.phone,
      list?.rows?.find((row) => row.id.endsWith(farm.propertyId))?.id ?? '',
    );
    const all = await actionsOf(sale.customer.customerId, 'location');
    expect(all.filter((one) => one.status === 'open')).toHaveLength(0);
    expect(
      all.filter((one) => one.property_id === farm.propertyId && one.status === 'closed').length,
    ).toBeGreaterThanOrEqual(1);
    // A pin that waits a day for its home alerts the person; a newer pin replaces it with an audit row.
    await sendInbound(sale.customer.phone, { location: { latitude: 16.6, longitude: 74.6 } });
    await sendInbound(sale.customer.phone, { location: { latitude: 16.7, longitude: 74.7 } });
    const [replaced] = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'customer_action.location_replaced' AND data IS NULL OR action = 'customer_action.location_replaced' LIMIT 1",
    );
    expect(replaced).toBeDefined();
    await rows(
      "UPDATE customer_actions SET created_at = now() - interval '25 hours', updated_at = now() - interval '25 hours' WHERE customer_id = $1 AND status = 'open' AND property_id IS NULL",
      [sale.customer.customerId],
    );
    await queueActionChecks(db(), new Date());
    const [waiting] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'location_home_waiting' AND body LIKE '%which home%' LIMIT 1",
    );
    expect(waiting).toBeDefined();
  });

  it('a pin in a chat a person holds is saved without a bot reply; the person is told', async () => {
    const sale = await sellProject(admin, { name: 'Review Held (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    await sendTo(
      admin,
      { projectId: sale.project.id },
      { action: 'ask_location', propertyId: customer.propertyId },
    );
    await rows("UPDATE wa_conversations SET state = 'human' WHERE phone = $1", [customer.phone]);
    await sendInbound(customer.phone, { location: { latitude: 16.4, longitude: 74.4 } });
    expect((await actionsOf(customer.customerId, 'location'))[0]?.status).toBe('closed');
    // (Outside working hours a held chat may hear who has it; never the bot's thank-you.)
    expect((await replies(customer.phone)).map((reply) => reply.body).join('\n')).not.toMatch(
      /Location saved/,
    );
    const [alert] = await rows("SELECT 1 FROM notifications WHERE kind = 'location_saved' LIMIT 1");
    expect(alert).toBeDefined();
  });

  it('chat proof with no instalment named answers only the oldest ask; the automatic reminder carries I paid another way', async () => {
    const sale = await sellProject(admin, { name: 'Review Proof (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    await sendTo(
      admin,
      { projectId: sale.project.id },
      { action: 'payment_reminder', milestoneId: advance.id },
    );
    await rows(
      `INSERT INTO customer_actions (type, customer_id, project_id, title, payload, requested_by_user_id)
       VALUES ('pay', $1, $2, 'Second ask (test)', '{"milestoneId":"00000000-0000-4000-8000-000000000001"}', $3)`,
      [customer.customerId, sale.project.id, admin.userId],
    );
    await photoAndQuestion(admin, customer.phone);
    await tap(customer.phone, 'what:pay');
    const pays = await actionsOf(customer.customerId, 'pay');
    expect(pays.map((one) => one.status).sort()).toEqual(['open', 'received']);
    expect(pays.find((one) => one.status === 'received')?.payload).toMatchObject({
      milestoneId: advance.id,
    });
    await rows(
      "UPDATE payment_milestones SET due_at = now() - interval '60 days', reminders_paused_until = NULL WHERE id = $1",
      [advance.id],
    );
    await queuePaymentReminders(db(), 'Asia/Kolkata', {
      secret: 'acceptance-pay-link-secret-00',
      days: 30,
    });
    const [sent] = await rows<{ payload: { paidPayload?: string } }>(
      "SELECT payload FROM outbox WHERE template = 'payment_reminder' AND dedupe_key LIKE $1 LIMIT 1",
      [`payment_reminder:${advance.id}:%`],
    );
    expect(sent?.payload.paidPayload).toBe(`paidother:${advance.id}`);
  });

  it('Home lists the location and call-back asks with their buttons', async () => {
    const sale = await sellProject(admin, { name: 'Review Home (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const scope = { projectId: sale.project.id };
    await sendTo(admin, scope, { action: 'ask_location', propertyId: customer.propertyId });
    await sendTo(admin, scope, { action: 'ask_callback' });
    await sendInbound(customer.phone, { text: 'hello' });
    await tap(customer.phone, 'go:see');
    const list = await lastOf(customer.phone, 'list');
    const ids = list?.rows?.map((row) => row.id) ?? [];
    expect(ids.some((id) => id.startsWith('locreq:'))).toBe(true);
    const pick = ids.find((id) => id.startsWith('cbask:'));
    expect(pick).toBeDefined();
    await tap(customer.phone, pick ?? '');
    expect((await lastOf(customer.phone, 'buttons'))?.buttons?.map((b) => b.title)).toEqual([
      'Morning',
      'Afternoon',
      'Evening',
    ]);
  });
});
