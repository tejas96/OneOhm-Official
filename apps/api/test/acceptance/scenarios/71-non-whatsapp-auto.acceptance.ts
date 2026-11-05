import { queueCustomerMessage } from '@oneohm/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { setTemplate } from '../support/journey-steps';
import { sellProject } from '../support/sales';
import { closeChat } from '../support/send';

// Redesign §17 for the asks the system makes itself: a customer not on WhatsApp gets one "Do in person" task
// for an answer only the chat can take (no SMS that says "open our WhatsApp chat"), its reminders are
// skipped, a switched-off message sends nothing, and marketing is never an SMS.

describe('Customers not on WhatsApp: automatic messages', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  async function smsCustomer(name: string) {
    const sale = await sellProject(admin, { name });
    await closeChat(sale.customer.phone);
    await rows("UPDATE customers SET contact_channel = 'sms' WHERE id = $1", [
      sale.customer.customerId,
    ]);
    return sale.customer;
  }
  const queue = (phone: string, template: string, given: Record<string, string>, key: string) =>
    queueCustomerMessage(acceptanceDb().db, phone, template, given, key);
  const sms = async (phone: string) =>
    (await outboxFor(phone)).filter((one) => one.channel === 'sms');
  const tasks = (customerId: string) =>
    rows<{ title: string; body: string; dedupe_key: string }>(
      'SELECT title, body, dedupe_key FROM customer_handovers WHERE customer_id = $1',
      [customerId],
    );

  it('a location ask is one in-person task even with its template off; its reminder and marketing send nothing', async () => {
    const customer = await smsCustomer('Auto Off Chat (test)');
    const given = { customer: 'Auto Off Chat', home: 'Baner', locationPayload: 'locreq:a1' };
    await queue(customer.phone, 'location_request', given, 'auto_ask:a1');
    await queue(customer.phone, 'location_request', given, 'auto_ask:a1');
    const [task] = await tasks(customer.customerId);
    expect(await tasks(customer.customerId)).toHaveLength(1);
    expect(task?.title).toMatch(/^Do in person: /);
    expect(task?.body).toContain('is not on WhatsApp');
    await queue(customer.phone, 'signature_reminder', { customer: 'A', home: 'Baner' }, 'r1');
    await queue(customer.phone, 'self_survey_offer', { customer: 'A', home: 'Baner' }, 'm1');
    await queue(customer.phone, 'amc_renewal_offer', { customer: 'A', home: 'Baner' }, 'm2');
    expect(await tasks(customer.customerId)).toHaveLength(1);
    expect(await sms(customer.phone)).toHaveLength(0);
  });

  it('a paper request is an SMS pointing to the app; a switched-off message sends nothing', async () => {
    const customer = await smsCustomer('Auto Sms (test)');
    const on = await setTemplate('paper_request', true);
    await queue(
      customer.phone,
      'paper_request',
      { customer: 'A', document: 'Electricity bill', home: 'Baner' },
      'p1',
    );
    const [text] = await sms(customer.phone);
    expect(JSON.stringify(text?.payload)).not.toContain('WhatsApp');
    await on();
    const back = await setTemplate('stage_rating_request', false);
    try {
      await queue(customer.phone, 'stage_rating_request', { customer: 'A', project: 'P' }, 'rt1');
      expect(await sms(customer.phone)).toHaveLength(1);
    } finally {
      await back();
    }
  });
});
