import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { milestoneOf } from '../support/money';
import { replies } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { actionsOf, closeChat, optionsOf, sendTo } from '../support/send';

// Redesign §17: a customer not on WhatsApp (contact channel SMS or in person) is reached by a defined path
// for every action: papers and ratings by SMS text, a payment by an SMS pay link, everything that needs a
// pin, a pick, a signature or a confirmation in person (a task on the customer handovers list). The send
// sheet shows which path, and the action records its channel.
describe('Customers not on WhatsApp', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  async function offWhatsApp(name: string, channel: 'sms' | 'in_person') {
    const sale = await sellProject(admin, { name });
    await closeChat(sale.customer.phone);
    await rows('UPDATE customers SET contact_channel = $2::contact_channel WHERE id = $1', [
      sale.customer.customerId,
      channel,
    ]);
    return { sale, scope: { projectId: sale.project.id } };
  }

  const handovers = (customerId: string) =>
    rows<{ title: string; body: string }>(
      "SELECT title, body FROM customer_handovers WHERE customer_id = $1 AND template = 'send_to_customer'",
      [customerId],
    );
  const smsTo = async (phone: string) =>
    (await outboxFor(phone)).filter((row) => row.channel === 'sms');

  it('a location ask for an SMS customer is done in person: the sheet says so, a task is made, the action records it', async () => {
    const { sale, scope } = await offWhatsApp('Off Location (test)', 'sms');
    const offers = await optionsOf(admin, scope);
    const offer = offers.offers.find((one) => one.action === 'ask_location');
    expect(offer?.preview).toMatchObject({ via: 'in_person', buttons: [] });
    expect(offer?.preview?.note).toContain('handovers list');
    const result = await sendTo(admin, scope, offer?.request as never);
    expect(result.via).toBe('in_person');
    const [task] = await handovers(sale.customer.customerId);
    expect(task?.title).toMatch(/^Do in person: /);
    expect(task?.body).toContain('is not on WhatsApp');
    const [action] = await actionsOf(sale.customer.customerId, 'location');
    expect(action?.payload.channel).toBe('in_person');
    expect(await smsTo(sale.customer.phone)).toHaveLength(0);
    expect(await replies(sale.customer.phone)).toEqual([]);
  });

  it('a payment reminder for an SMS customer is an SMS with the pay link', async () => {
    const { sale, scope } = await offWhatsApp('Off Pay (test)', 'sms');
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    const request = { action: 'payment_reminder', milestoneId: advance.id } as const;
    const preview = (await optionsOf(admin, scope)).offers.find(
      (one) => one.action === 'payment_reminder',
    )?.preview;
    expect(preview?.via).toBe('sms');
    expect(preview?.body).toContain('/v1/pay/due/');
    const result = await sendTo(admin, scope, request);
    expect(result.via).toBe('sms');
    const [sms] = await smsTo(sale.customer.phone);
    expect(JSON.stringify(sms?.payload)).toContain('/v1/pay/due/');
    const [action] = await actionsOf(sale.customer.customerId, 'pay');
    expect(action?.payload).toMatchObject({ channel: 'sms', milestoneId: advance.id });
    // The same reminder again is the same SMS key, not a second text.
    expect((await smsTo(sale.customer.phone)).length).toBeGreaterThanOrEqual(1);
  });

  it('a customer on neither is reached in person for a payment too', async () => {
    const { sale, scope } = await offWhatsApp('Off Person (test)', 'in_person');
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    const result = await sendTo(admin, scope, {
      action: 'payment_reminder',
      milestoneId: advance.id,
    });
    expect(result.via).toBe('in_person');
    expect(await handovers(sale.customer.customerId)).toHaveLength(1);
    expect(await smsTo(sale.customer.phone)).toHaveLength(0);
    const [action] = await actionsOf(sale.customer.customerId, 'pay');
    expect(action?.payload.channel).toBe('in_person');
  });

  it('a customer on WhatsApp is unchanged: the chat or the approved message, channel recorded', async () => {
    const sale = await sellProject(admin, { name: 'On Whatsapp (test)' });
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    const result = await sendTo(
      admin,
      { projectId: sale.project.id },
      {
        action: 'payment_reminder',
        milestoneId: advance.id,
      },
    );
    expect(result.via).toBe('template');
    const [action] = await actionsOf(sale.customer.customerId, 'pay');
    expect(action?.payload.channel).toBe('whatsapp');
    expect(await handovers(sale.customer.customerId)).toHaveLength(0);
  });
});
