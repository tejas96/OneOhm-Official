import type { CustomerHome } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionChecks } from '../../../../worker/src/activities/action-checks';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { acceptanceDb, closeDb, outboxFor, rows } from '../support/db';
import { Session } from '../support/http';
import { markDone, NOON, taskIdOf } from '../support/journey-steps';
import { choices, lastReply, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { credits, offerSurvey, sendWholeSurvey, surveysOf } from '../support/self-survey';
import { closeChat } from '../support/send';
import { visitsFor } from '../support/visits';

// The engineer's other choices and the rest of the survey's life (redesign §7): ask again for one
// item, a visit instead (no discount), an unfinished survey, the staff deadline, and the customer
// app's subsidy line.

describe('Self survey: ask again, a visit instead, unfinished, deadlines', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  async function received(name: string) {
    const sale = await sellProject(admin, { name });
    const { ask, taskId } = await offerSurvey(admin, sale);
    await sendWholeSurvey(sale.customer.phone, sale, ask.id);
    return { sale, ask, taskId };
  }

  it('Ask again asks only that item; the new photo replaces the old one on the step', async () => {
    const { sale, ask, taskId } = await received('Survey Again (test)');
    const { phone, customerId } = sale.customer;
    const meterBefore = await rows<{ id: string }>(
      "SELECT id FROM documents WHERE task_id = $1 AND name LIKE 'Self survey: electricity meter%'",
      [taskId],
    );
    expect(meterBefore).toHaveLength(1);
    const view = await admin.post<{ status: string; askAgain: string[] }>(
      `/self-surveys/${ask.id}/ask-again`,
      { items: ['meter'] },
    );
    expect(view).toMatchObject({ status: 'open', askAgain: ['meter'] });
    const said = (
      await rows<{ payload: { body: string } }>(
        "SELECT payload FROM outbox WHERE recipient = $1 AND template LIKE 'session:%' ORDER BY created_at DESC LIMIT 2",
        [phone],
      )
    ).map((row) => row.payload.body);
    expect(said[1]).toBe(
      'Our engineer needs one more thing from your survey: the photo of your meter. We ask it again below.',
    );
    expect(said[0]).toBe(
      'Please send a photo of your electricity meter. The meter number must be readable.',
    );
    // Asking again twice is refused (it is with the customer now).
    expect(
      (await admin.raw('POST', `/self-surveys/${ask.id}/ask-again`, { items: ['meter'] })).status,
    ).toBe(409);
    await import('../support/whatsapp').then(({ sendInbound }) =>
      sendInbound(phone, { media: { type: 'image', fileId: `again-meter-${Date.now()}` } }),
    );
    expect((await surveysOf(customerId))[0]).toMatchObject({ status: 'received' });
    const onTask = await rows<{ id: string; removed: boolean }>(
      `SELECT id, removed_at IS NOT NULL AS removed FROM documents
        WHERE task_id = $1 AND name LIKE 'Self survey: electricity meter%' ORDER BY created_at`,
      [taskId],
    );
    expect(onTask.map((one) => one.removed)).toEqual([true, false]);
    expect(onTask[0]?.id).toBe(meterBefore[0]?.id);
    // Window closed: the continue template goes instead.
    const again = await received('Survey Again Closed (test)');
    await closeChat(again.sale.customer.phone);
    await admin.post(`/self-surveys/${again.ask.id}/ask-again`, { items: ['shade', 'size'] });
    const sent = (await outboxFor(again.sale.customer.phone)).filter(
      (row) => row.template === 'self_survey_reminder',
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.continuePayload).toBe(`ss:go:${again.ask.id}`);
  });

  it('Book a visit (team) turns it into a visit pick with no discount', async () => {
    const { sale, ask } = await received('Survey Visit Team (test)');
    const view = await admin.post<{ status: string }>(`/self-surveys/${ask.id}/visit`, {});
    expect(view.status).toBe('cancelled');
    const list = await lastReply(sale.customer.phone);
    expect(choices(list).some((id) => id.startsWith('vday:'))).toBe(true);
    const [pick] = await rows<{ status: string }>(
      "SELECT status::text AS status FROM customer_actions WHERE customer_id = $1 AND type = 'visit_pick'",
      [sale.customer.customerId],
    );
    expect(pick?.status).toBe('open');
    expect(await credits(sale.project.id)).toEqual([]);
    expect((await surveysOf(sale.customer.customerId))[0]?.status).toBe('cancelled');
    expect(await visitsFor(sale.customer.customerId)).toEqual([]);
  });

  it('[Book a visit instead] from the offer: the survey is cancelled and the customer picks a day', async () => {
    const sale = await sellProject(admin, { name: 'Survey Visit Customer (test)' });
    const { ask } = await offerSurvey(admin, sale);
    await tap(sale.customer.phone, `ss:visit:${ask.id}`);
    expect((await surveysOf(sale.customer.customerId))[0]?.status).toBe('cancelled');
    expect(
      (await lastReply(sale.customer.phone))?.rows?.some((r) => r.id.startsWith('vday:')),
    ).toBe(true);
    // The old buttons are answered kindly and change nothing.
    await tap(sale.customer.phone, `ss:go:${ask.id}`);
    expect((await lastReply(sale.customer.phone))?.body).toContain('That survey is closed');
    expect(await credits(sale.project.id)).toEqual([]);
  });

  it('started but not sent: Home says "Finish", shows for 7 days, a reminder goes at 2 days (marketing template)', async () => {
    const sale = await sellProject(admin, { name: 'Survey Unfinished (test)' });
    await rows(
      "UPDATE payment_milestones SET status = 'paid' WHERE project_id = $1 AND status = 'due'",
      [sale.project.id],
    );
    const { phone, customerId } = sale.customer;
    const { ask } = await offerSurvey(admin, sale);
    await tap(phone, `ss:go:${ask.id}`);
    await tap(phone, 'menu');
    const home = await lastReply(phone);
    expect(home?.body).toContain('Finish your site survey');
    expect(home?.buttons?.[0]).toMatchObject({ title: 'Finish survey', id: `ss:go:${ask.id}` });
    // A tap on Finish continues where it stopped (roof was answered or the first question again).
    await tap(phone, `ss:go:${ask.id}`);
    expect((await lastReply(phone))?.body).toBe('What is your roof made of?');

    const db = acceptanceDb().db;
    await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
      ask.id,
      new Date(NOON.getTime() - 3 * 86_400_000),
    ]);
    await queueActionReminders(db, NOON, 'Asia/Kolkata');
    await queueActionReminders(db, NOON, 'Asia/Kolkata');
    const reminders = (await outboxFor(phone)).filter(
      (row) => row.template === 'self_survey_reminder',
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.payload).toMatchObject({ continuePayload: `ss:go:${ask.id}` });
    const [off] = await rows<{ active: boolean }>(
      "SELECT active FROM message_templates WHERE key = 'self_survey_reminder'",
    );
    expect(off?.active).toBe(false);

    // After 7 days from the start Home stops offering it.
    await rows(
      "UPDATE customer_actions SET payload = jsonb_set(payload, '{startedAt}', to_jsonb($2::text)) WHERE id = $1",
      [ask.id, new Date(Date.now() - 8 * 86_400_000).toISOString()],
    );
    await tap(phone, 'menu');
    expect((await lastReply(phone))?.body ?? '').not.toContain('site survey');
    expect((await surveysOf(customerId))[0]?.status).toBe('open');
  });

  it('a survey waiting for its check alerts the owner after 1 working day and the manager after 2', async () => {
    const { ask, sale } = await received('Survey Deadline (test)');
    const db = acceptanceDb().db;
    await rows('UPDATE customer_actions SET done_at = $2, updated_at = $2 WHERE id = $1', [
      ask.id,
      new Date(NOON.getTime() - 4 * 86_400_000),
    ]);
    await queueActionChecks(db, NOON);
    await queueActionChecks(db, NOON);
    const alerts = await rows<{ title: string }>(
      'SELECT title FROM notifications WHERE dedupe_key LIKE $1',
      [`action_check:${ask.id}:%`],
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]?.title).toContain('Check the self survey');
    expect(sale.project.id).toBeDefined();
  });

  it('the customer app subsidy line says what WhatsApp says (received / checking)', async () => {
    const sale = await sellProject(admin, { name: 'Survey Subsidy Line (test)' });
    const { phone, customerId } = sale.customer;
    await markDone(await taskIdOf(sale, 'subsidy_release'));
    const app = await Session.code(phone, 'customer');
    const note = async () =>
      (await app.get<CustomerHome>('/customer/home')).projects.find(
        (one) => one.id === sale.project.id,
      )?.subsidy;
    expect(await note()).toMatchObject({ status: 'released', note: null });
    // "Not yet": we are checking.
    await rows(
      `INSERT INTO customer_actions (type, customer_id, project_id, title, payload)
       VALUES ('confirm', $1, $2, 'Subsidy received? (test)', '{"kind":"subsidy_credit","answer":"not_yet"}')`,
      [customerId, sale.project.id],
    );
    expect(await note()).toMatchObject({ note: 'checking' });
    await tap(phone, 'go:update');
    expect((await lastReply(phone))?.body).toContain(
      'Subsidy: we are checking with the government',
    );
    // It arrived.
    await rows(
      "INSERT INTO project_facts (project_id, key, value) VALUES ($1, 'subsidy_received', '2026-11-04')",
      [sale.project.id],
    );
    expect(await note()).toMatchObject({ note: 'received' });
    await tap(phone, 'go:update');
    expect((await lastReply(phone))?.body).toContain('Subsidy reached your bank ✅');
  });
});
