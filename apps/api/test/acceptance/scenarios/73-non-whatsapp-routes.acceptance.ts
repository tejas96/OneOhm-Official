import {
  customerNotice,
  fallBackToSms,
  GENERIC_WORDS,
  queueCustomerMessage,
} from '@oneohm/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { setTemplate } from '../support/journey-steps';
import { runPaperReminders } from '../support/paper-reminders';
import { sellProject } from '../support/sales';
import { closeChat } from '../support/send';

// Customers not on WhatsApp, round 3: a number WhatsApp says is not on it follows the same rules as a customer
// set to SMS; an in-person customer gets staff tasks whatever the template row says; automatic asks remember
// their channel and ticking the task closes them; SMS words never mention the chat.

describe('Customers not on WhatsApp: fallback, in-person route, ticking the task', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const db = () => acceptanceDb().db;
  const queue = (phone: string, template: string, given: Record<string, string>, key: string) =>
    queueCustomerMessage(db(), phone, template, given, key);
  const sms = async (phone: string) =>
    (await outboxFor(phone)).filter((one) => one.channel === 'sms');
  const tasks = (customerId: string) =>
    rows<{ id: string; title: string; action_id: string | null }>(
      'SELECT id, title, action_id FROM customer_handovers WHERE customer_id = $1',
      [customerId],
    );
  const words = (template: string, payload: Record<string, string>) =>
    customerNotice(template, payload, 'sms') ?? GENERIC_WORDS;
  const person = async (name: string, channel: 'whatsapp' | 'sms' | 'in_person') => {
    const sale = await sellProject(admin, { name });
    await closeChat(sale.customer.phone);
    await rows('UPDATE customers SET contact_channel = $2::contact_channel WHERE id = $1', [
      sale.customer.customerId,
      channel,
    ]);
    return sale;
  };
  const failed = async (phone: string, template: string) => {
    const [row] = (await outboxFor(phone)).filter((one) => one.template === template);
    return fallBackToSms(db(), row?.id ?? '', words);
  };

  it('a number WhatsApp rejects: a chat-only ask is one task, marketing nothing, a paper ask an app SMS', async () => {
    const sale = await person('Fallback (test)', 'whatsapp');
    const { phone, customerId } = sale.customer;
    const back = await setTemplate('location_request', true);
    const on = await setTemplate('paper_request', true);
    const offer = await setTemplate('self_survey_offer', true);
    try {
      await queue(
        phone,
        'location_request',
        { customer: 'A', home: 'Baner', locationPayload: 'x' },
        'fb1',
      );
      await queue(phone, 'self_survey_offer', { customer: 'A', home: 'Baner' }, 'fb2');
      await queue(
        phone,
        'paper_request',
        { customer: 'A', document: 'Bill', home: 'Baner' },
        'fb3',
      );
      await failed(phone, 'location_request');
      await failed(phone, 'self_survey_offer');
      await failed(phone, 'paper_request');
    } finally {
      await back();
      await on();
      await offer();
    }
    expect((await tasks(customerId)).map((one) => one.title)).toEqual([
      'Ask Fallback (test) in person for the location of Baner',
    ]);
    const texts = await sms(phone);
    expect(texts).toHaveLength(1);
    expect(texts[0]?.template).toBe('paper_request');
    expect(JSON.stringify(texts[0]?.payload)).not.toContain('WhatsApp');
  });

  it('a customer on neither channel gets the task for a new message whatever its template row says', async () => {
    const sale = await person('Neither (test)', 'in_person');
    const back = await setTemplate('visit_booked', false);
    try {
      await queue(
        sale.customer.phone,
        'visit_booked',
        { customer: 'A', when: 'Mon', staff: 'Ravi' },
        'ip1',
      );
    } finally {
      await back();
    }
    expect(await tasks(sale.customer.customerId)).toHaveLength(1);
  });

  it('an automatic ask remembers its channel; ticking its task closes it and stops the escalation', async () => {
    const sale = await person('Tick (test)', 'sms');
    const { customerId, phone } = sale.customer;
    const [ask] = await rows<{ id: string }>(
      `INSERT INTO customer_actions (type, customer_id, project_id, title, created_at, updated_at)
       VALUES ('location', $1, $2, 'Share the location', now() - interval '6 days', now() - interval '6 days')
       RETURNING id`,
      [customerId, sale.project.id],
    );
    await queue(
      phone,
      'location_request',
      { customer: 'A', home: 'Baner', locationPayload: `locreq:${ask?.id}` },
      'tk1',
    );
    const [task] = await tasks(customerId);
    expect(task?.action_id).toBe(ask?.id);
    const [before] = await rows<{ channel: string }>(
      "SELECT payload->>'channel' AS channel FROM customer_actions WHERE id = $1",
      [ask?.id],
    );
    expect(before?.channel).toBe('in_person');
    await admin.post(`/handovers/${task?.id}/done`, {});
    const [after] = await rows<{ status: string }>(
      'SELECT status::text AS status FROM customer_actions WHERE id = $1',
      [ask?.id],
    );
    expect(after?.status).toBe('closed');
    expect(
      await rows(
        "SELECT 1 FROM audit_log WHERE action = 'customer_action.done_in_person' AND entity_id = $1",
        [ask?.id],
      ),
    ).toHaveLength(1);
    await queueActionReminders(db(), new Date(Date.now() + 5 * 86_400_000), 'Asia/Kolkata');
    expect(
      await rows('SELECT 1 FROM notifications WHERE dedupe_key LIKE $1', [
        `action_waiting:${ask?.id}%`,
      ]),
    ).toHaveLength(0);
  });

  it('a payment cannot be closed with a tap; a roof question takes Yes', async () => {
    const sale = await person('Close Rules (test)', 'in_person');
    const { customerId } = sale.customer;
    const make = (type: string, payload: object) =>
      rows<{ id: string }>(
        `INSERT INTO customer_actions (type, customer_id, project_id, title, payload)
         VALUES ($2::customer_action_type, $1, $3, 'Ask', $4::jsonb) RETURNING id`,
        [customerId, type, sale.project.id, JSON.stringify(payload)],
      );
    const [pay] = await make('pay', { channel: 'in_person' });
    const refused = await admin.raw('POST', `/document-requests/${pay?.id}/done-in-person`, {});
    expect(refused.status).toBe(409);
    const [roof] = await make('confirm', { channel: 'in_person', kind: 'site_ready' });
    const done = await admin.post<{ status: string }>(
      `/document-requests/${roof?.id}/done-in-person`,
      { answer: 'yes' },
    );
    expect(done.status).toBe('closed');
  });

  it('SMS words: a shared paper and a visit reminder never mention the chat; a paper reminder still goes', async () => {
    const sale = await person('Words (test)', 'sms');
    const { phone } = sale.customer;
    const shared = await setTemplate('document_share', true);
    const remind = await setTemplate('visit_reminder', true);
    try {
      await queue(phone, 'document_share', { customer: 'A', document: 'Layout' }, 'w1');
      await queue(
        phone,
        'visit_reminder',
        { customer: 'A', home: 'Baner', when: 'tomorrow morning', work: 'installation' },
        'w2',
      );
    } finally {
      await shared();
      await remind();
    }
    const texts = (await sms(phone)).map((one) => String(one.payload.text));
    expect(texts).toHaveLength(2);
    for (const text of texts) expect(text).not.toContain('WhatsApp');
    expect(texts.some((text) => text.includes('Find it in the OneOhm app'))).toBe(true);
    expect(texts.some((text) => text.includes('Our team visits Baner tomorrow morning'))).toBe(
      true,
    );

    const on = await setTemplate('paper_request', true);
    try {
      const asked = await admin.post<{ id: string }>('/document-requests', {
        projectId: sale.project.id,
        category: 'electricity_bill',
        title: 'Electricity bill',
      });
      await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
        asked.id,
        new Date(Date.now() - 49 * 3_600_000),
      ]);
      await runPaperReminders();
      expect(
        (await sms(phone)).some((one) => one.dedupe_key.startsWith(`paper_reminder:${asked.id}`)),
      ).toBe(true);
    } finally {
      await on();
    }
  });
});
