import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queueActionChecks } from '../../../../worker/src/activities/action-checks';
import { queueActionReminders } from '../../../../worker/src/activities/action-reminders';
import { acceptanceDb, closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { milestoneOf } from '../support/money';
import { lastReply, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { actionsOf, closeChat, openChat, optionsOf, sendTo, templatesFor } from '../support/send';
import { ensureTeam, STAFF, staffEmail, TEAM_PASSWORD } from '../support/team';

// Review round 1 of phase 3a: rights, a closed-window preview in the customer's language, one send per
// press, the call-back "To call" rule, staff-check escalation, a pin that adopts its ask, a held chat,
// proof that answers one ask, and the asks on Home.

const DAY = 86_400_000;
// Thursday 18:30 IST: a working day after Wednesday 18:30, two after Tuesday 18:30 (Mon-Sat 9:30-18:30).
const CHECK_NOW = new Date('2026-11-05T13:00:00Z');
const db = () => acceptanceDb().db;

describe('Send to customer: review fixes', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
    await ensureTeam(admin);
  });
  afterAll(closeDb);

  it('cancelling a payment ask needs the payment rights; a closed-window preview is in the customer language', async () => {
    const sale = await sellProject(admin, { name: 'Review Rights (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    const scope = { projectId: sale.project.id };
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    await sendTo(admin, scope, { action: 'payment_reminder', milestoneId: advance.id });
    const [pay] = await actionsOf(customer.customerId, 'pay');
    const hr = await Session.password(staffEmail('hr'), TEAM_PASSWORD);
    expect(STAFF.hr.roles).toEqual(['hr']);
    expect((await hr.raw('POST', `/document-requests/${pay?.id}/cancel`)).status).toBe(403);
    expect((await hr.raw('POST', `/customer-actions/${pay?.id}/called`)).status).toBe(403);
    // Closed window, Marathi: the stored wording and the quick-reply titles.
    await tap(customer.phone, 'lang:mr');
    await closeChat(customer.phone);
    const offer = (await optionsOf(admin, scope)).offers.find(
      (one) => one.action === 'payment_reminder',
    );
    expect(offer?.preview).toMatchObject({ via: 'template', language: 'mr' });
    expect(offer?.preview?.body).toMatch(/^नमस्कार .+, तुमच्या .+ घरासाठी ₹.+ बाकी आहे\./);
    expect(offer?.preview?.buttons).toEqual(['आता भरा', 'दुसऱ्या मार्गे भरले']);
    // Cancelling says the payment is still due.
    await openChat(customer.phone, customer.customerId);
    await admin.post(`/document-requests/${pay?.id}/cancel`);
    expect((await lastReply(customer.phone))?.body).toMatch(/अजून बाकी आहे/);
  });

  it('one press of Send is one send, even twice at once', async () => {
    const sale = await sellProject(admin, { name: 'Review Twice (test)' });
    await openChat(sale.customer.phone, sale.customer.customerId);
    const body = {
      scope: { projectId: sale.project.id },
      request: { action: 'ask_callback' },
      requestId: crypto.randomUUID(),
    };
    const both = await Promise.all([
      admin.raw('POST', '/send-to-customer', body),
      admin.raw('POST', '/send-to-customer', body),
    ]);
    expect(both.map((one) => one.status)).toEqual([201, 201]);
    const ids = both.map((one) => (one.body as { actionId: string }).actionId);
    expect(ids[0]).toBe(ids[1]);
    expect(await actionsOf(sale.customer.customerId, 'callback')).toHaveLength(1);
    // A second call-back ask while one waits is refused.
    const again = await admin.raw('POST', '/send-to-customer', {
      ...body,
      requestId: crypto.randomUUID(),
    });
    expect(again.status).toBe(409);
  });

  it('a call-back waits as To call and sets a later lead follow-up; escalation at 1 and 2 days; a nudge at 2 days', async () => {
    const sale = await sellProject(admin, { name: 'Review Callback (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    await rows(
      "UPDATE leads SET stage = 'new', next_action_on = current_date + 30, next_action_time = '08:00' WHERE id = $1",
      [customer.leadId],
    );
    await sendTo(admin, { projectId: sale.project.id }, { action: 'ask_callback' });
    const [ask] = await actionsOf(customer.customerId, 'callback');
    // Never picked: the customer is nudged at 2 days with the three buttons.
    await rows(
      "UPDATE customer_actions SET created_at = now() - interval '2 days 1 hour' WHERE id = $1",
      [ask?.id],
    );
    await queueActionReminders(db(), new Date(Date.now() - 0), 'Asia/Kolkata');
    const noon = new Date();
    noon.setUTCHours(6, 30, 0, 0);
    await rows('UPDATE customer_actions SET created_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(noon.getTime() - 2.1 * DAY),
    ]);
    await queueActionReminders(db(), noon, 'Asia/Kolkata');
    expect((await templatesFor(customer.phone, 'callback_request')).at(-1)?.payload).toMatchObject({
      morningPayload: `cb:${ask?.id}:morning`,
    });
    await tap(customer.phone, `cb:${ask?.id}:evening`);
    const [lead] = await rows<{ next_action_time: string; note: string }>(
      'SELECT next_action_time, next_action_note AS note FROM leads WHERE id = $1',
      [customer.leadId],
    );
    // A follow-up planned for later than the slot gives way to it (a sooner plan is kept: domain unit test).
    expect(lead?.next_action_time).toBe('17:30');
    expect((await actionsOf(customer.customerId, 'callback'))[0]?.status).toBe('received');
    // Staff check escalation: 1 day the person who asked, 2 days the project manager.
    await rows('UPDATE customer_actions SET done_at = $2, updated_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(CHECK_NOW.getTime() - DAY),
    ]);
    await queueActionChecks(db(), CHECK_NOW);
    await rows('UPDATE customer_actions SET done_at = $2, updated_at = $2 WHERE id = $1', [
      ask?.id,
      new Date(CHECK_NOW.getTime() - 2 * DAY),
    ]);
    await queueActionChecks(db(), CHECK_NOW);
    await queueActionChecks(db(), CHECK_NOW);
    const alerts = await rows<{ dedupe_key: string }>(
      'SELECT dedupe_key FROM notifications WHERE dedupe_key LIKE $1',
      [`action_check:${ask?.id}:%`],
    );
    expect(
      [...new Set(alerts.map((one) => one.dedupe_key.split(':').slice(0, 3).join(':')))].sort(),
    ).toEqual([`action_check:${ask?.id}:manager`, `action_check:${ask?.id}:owner`]);
    // A call written on the lead closes the ask.
    await admin.post(`/leads/${customer.leadId}/activities`, {
      kind: 'call',
      note: 'Called, all good',
    });
    expect((await actionsOf(customer.customerId, 'callback'))[0]?.status).toBe('closed');
  });
});
