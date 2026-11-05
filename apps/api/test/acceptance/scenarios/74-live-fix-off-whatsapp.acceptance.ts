import { fallBackToSms, queueCustomerMessage } from '@oneohm/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { chatOf, say } from '../support/onboarding';
import { addDays, sellProject, uniquePhone } from '../support/sales';
import { closeChat } from '../support/send';
import { morningOn, noonOn, runVisitWorker, templateOn } from '../support/visit-worker';
import { setVisit, visitsOf, visitTask } from '../support/visits';
import { sendStatus } from '../support/whatsapp';

// Live-test fix wave, customers not on WhatsApp: the in-person answers, the visit reminder, the app
// inbox wording and the SMS fallback.

const db = () => acceptanceDb().db;

describe('Customers not on WhatsApp: live-test fixes', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const person = async (name: string, channel: 'whatsapp' | 'sms' | 'in_person') => {
    const sale = await sellProject(admin, { name });
    await closeChat(sale.customer.phone);
    await rows('UPDATE customers SET contact_channel = $2::contact_channel WHERE id = $1', [
      sale.customer.customerId,
      channel,
    ]);
    return sale;
  };

  /** An in-person confirm ask with the team's task behind it. */
  async function confirmAsk(sale: Awaited<ReturnType<typeof person>>, kind: string) {
    const [ask] = await rows<{ id: string }>(
      `INSERT INTO customer_actions (type, customer_id, project_id, title, payload)
       VALUES ('confirm', $1, $2, 'Ask', $3::jsonb) RETURNING id`,
      [sale.customer.customerId, sale.project.id, JSON.stringify({ channel: 'in_person', kind })],
    );
    await rows(
      `INSERT INTO customer_handovers (customer_id, project_id, action_id, template, title, body, dedupe_key)
       VALUES ($1, $2, $3, 'site_ready_check', 'Ask', 'Do it in person', $4)`,
      [sale.customer.customerId, sale.project.id, ask?.id, `task:${ask?.id}`],
    );
    return ask?.id ?? '';
  }
  const answer = (id: string, value: 'yes' | 'not_yet') =>
    admin.raw('POST', `/document-requests/${id}/done-in-person`, { answer: value });
  const state = async (id: string) =>
    (
      await rows<{ status: string; answer: string | null; task_done: Date | null; log: string }>(
        `SELECT a.status::text AS status, a.payload->>'answer' AS answer,
                (SELECT done_at FROM customer_handovers WHERE action_id = a.id) AS task_done,
                (SELECT count(*)::text FROM project_activities WHERE data->>'customerActionId' = a.id::text) AS log
           FROM customer_actions a WHERE a.id = $1`,
        [id],
      )
    )[0];

  it('Not yet on an installation question is refused; the roof question takes it once, in person', async () => {
    const sale = await person('In Person Answers (test)', 'in_person');
    const install = await confirmAsk(sale, 'installation');
    const refused = await answer(install, 'not_yet');
    expect(refused.status).toBe(400);
    expect(await state(install)).toMatchObject({ status: 'open', answer: null, log: '0' });

    const roof = await confirmAsk(sale, 'site_ready');
    expect((await answer(roof, 'not_yet')).status).toBeLessThan(300);
    // Asking Not yet again changes nothing: one log line, one audit row, the ask and its task stay open.
    expect((await answer(roof, 'not_yet')).status).toBeLessThan(300);
    expect(await state(roof)).toMatchObject({
      status: 'open',
      answer: 'not_yet',
      log: '1',
      task_done: null,
    });
    const [line] = await rows<{ message: string; user_id: string | null }>(
      `SELECT message, user_id FROM project_activities WHERE data->>'customerActionId' = $1`,
      [roof],
    );
    expect(line?.message).toMatch(/not ready yet \(in person\)$/);
    expect(line?.message).not.toContain('WhatsApp');
    expect(line?.user_id).toBe(admin.userId);
    const audit = await rows<{ actor_user_id: string }>(
      "SELECT actor_user_id FROM audit_log WHERE action = 'customer_action.answered' AND entity_id = $1",
      [roof],
    );
    expect(audit).toEqual([{ actor_user_id: admin.userId }]);

    // Yes closes the ask and ticks the task in the same step.
    expect((await answer(roof, 'yes')).status).toBeLessThan(300);
    const done = await state(roof);
    expect(done?.status).toBe('closed');
    expect(done?.task_done).not.toBeNull();
    // The installation question takes Yes.
    expect((await answer(install, 'yes')).status).toBeLessThan(300);
    expect((await state(install))?.status).toBe('closed');
  });

  it('a reminder already queued still marks the visit, and is not queued again', async () => {
    const restore = await templateOn('visit_reminder');
    try {
      const sale = await sellProject(admin, { name: 'Reminder Dup (test)' });
      const { customer } = sale;
      const task = await visitTask(sale, 'structure_installation');
      const day = (await visitsOf(admin, { taskId: task })).freeDays[3] ?? '';
      const visit = await setVisit(admin, { taskId: task, day, slot: 'morning' });
      await closeChat(customer.phone);
      await rows(
        `INSERT INTO outbox (channel, recipient, template, payload, dedupe_key)
         VALUES ('whatsapp', $1, 'visit_reminder', '{}'::jsonb, $2)`,
        [customer.phone, `visit_reminder:${visit.id}:${day}:morning`],
      );
      const before = (await outboxFor(customer.phone)).length;
      const eve = addDays(day, -1);
      const when = new Date(`${eve}T00:00:00Z`).getUTCDay() === 0 ? addDays(eve, -1) : eve;
      await runVisitWorker(noonOn(when));
      const [row] = await rows<{ sent: Date | null }>(
        'SELECT reminder_sent_at AS sent FROM visits WHERE id = $1',
        [visit.id],
      );
      expect(row?.sent).not.toBeNull();
      await runVisitWorker(noonOn(when));
      expect((await outboxFor(customer.phone)).length).toBe(before);
    } finally {
      await restore();
    }
  });

  it('a customer on neither channel: the reminder is a task in staff words and the morning alert says so', async () => {
    const restore = await templateOn('visit_reminder');
    try {
      const sale = await person('Reminder Task (test)', 'in_person');
      const task = await visitTask(sale, 'structure_installation');
      const day = (await visitsOf(admin, { taskId: task })).freeDays[3] ?? '';
      await setVisit(admin, { taskId: task, day, slot: 'morning' });
      const eve = addDays(day, -1);
      const when = new Date(`${eve}T00:00:00Z`).getUTCDay() === 0 ? addDays(eve, -1) : eve;
      await runVisitWorker(noonOn(when));
      const tasks = await rows<{ title: string }>(
        "SELECT title FROM customer_handovers WHERE customer_id = $1 AND template = 'visit_reminder'",
        [sale.customer.customerId],
      );
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.title).toMatch(/^Tell .+ in person that our team visits /);
      await runVisitWorker(morningOn(day));
      const [alert] = await rows<{ body: string }>(
        "SELECT body FROM notifications WHERE kind = 'visit_not_confirmed' AND body LIKE '%task was made%'",
      );
      expect(alert?.body).toBe(
        'No reminder reached them — a task was made. Please call them before the team goes.',
      );
    } finally {
      await restore();
    }
  });

  it('the app inbox for a customer off WhatsApp never points to the chat', async () => {
    const sms = await person('Inbox Sms (test)', 'sms');
    const chat = await person('Inbox Chat (test)', 'whatsapp');
    for (const sale of [sms, chat]) {
      await queueCustomerMessage(
        db(),
        sale.customer.phone,
        'document_share',
        { customer: 'A', document: 'Layout' },
        `ins:${sale.customer.customerId}`,
      );
      await queueCustomerMessage(
        db(),
        sale.customer.phone,
        'visit_reminder',
        { customer: 'A', home: 'Baner', when: 'tomorrow morning', work: 'installation' },
        `inr:${sale.customer.customerId}`,
      );
    }
    const bodies = (id: string) =>
      rows<{ kind: string; body: string }>(
        'SELECT kind, body FROM notifications WHERE customer_id = $1 AND kind IN ($2, $3) ORDER BY kind',
        [id, 'document_share', 'visit_reminder'],
      );
    const off = await bodies(sms.customer.customerId);
    expect(off.map((one) => one.body)).toEqual([
      'It is in Documents.',
      'Please open the OneOhm app or call us.',
    ]);
    const on = await bodies(chat.customer.customerId);
    expect(on.some((one) => one.body.includes('We sent it on WhatsApp'))).toBe(true);
  });

  it('a chat-only ask for a number with no customer is not sent as an SMS', async () => {
    const phone = uniquePhone();
    const [queued] = await rows<{ id: string }>(
      `INSERT INTO outbox (channel, recipient, template, payload, dedupe_key, status)
       VALUES ('whatsapp', $1, 'location_request', '{"home":"Baner"}'::jsonb, $2, 'failed') RETURNING id`,
      [phone, `m8:${phone}`],
    );
    const did = await fallBackToSms(db(), queued?.id ?? '', () => ({ title: 'T', body: 'B' }));
    expect(did).toBe('none');
    expect((await outboxFor(phone)).filter((one) => one.channel === 'sms')).toHaveLength(0);
  });

  it('the fallback says what it did: a task for a chat-only ask', async () => {
    const sale = await person('Fallback Says (test)', 'whatsapp');
    const { phone } = sale.customer;
    const [chatAsk] = await rows<{ id: string }>(
      `INSERT INTO outbox (channel, recipient, template, payload, dedupe_key, status)
       VALUES ('whatsapp', $1, 'location_request', '{"home":"Baner"}'::jsonb, $2, 'failed') RETURNING id`,
      [phone, `m3a:${phone}`],
    );
    const did = await fallBackToSms(db(), chatAsk?.id ?? '', () => ({ title: 'T', body: 'B' }));
    expect(did).toBe('task');
  });

  it('a staff message that fails as not on WhatsApp has no SMS and still alerts the chat', async () => {
    const sale = await person('Staff Failure (test)', 'whatsapp');
    const { phone } = sale.customer;
    await say(phone, 'hello');
    const chat = await chatOf(phone);
    const wamid = `wamid.staff-${phone.slice(1)}`;
    await rows(
      `INSERT INTO outbox (channel, recipient, template, payload, dedupe_key, status, provider_message_id, delivery_status)
       VALUES ('whatsapp', $1, 'staff_welcome', '{}'::jsonb, $2, 'sent', $3, 'sent')`,
      [phone, `m4:${phone}`, wamid],
    );
    await sendStatus(wamid, 'failed', 131026);
    const told = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'whatsapp_send_failed' AND subject_id = $1",
      [chat.id],
    );
    expect(told).toHaveLength(1);
    expect((await outboxFor(phone)).filter((one) => one.channel === 'sms')).toHaveLength(0);
  });
});
