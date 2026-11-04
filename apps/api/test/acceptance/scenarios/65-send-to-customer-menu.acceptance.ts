import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { newCustomer, sellProject, today, uniquePhone } from '../support/sales';
import {
  actionsOf,
  closeChat,
  lastOf,
  openChat,
  optionsOf,
  sendTo,
  templatesFor,
} from '../support/send';

// The "Send to customer" menu (redesign §18): what each place offers, the preview in the customer's
// language, documents, crew contact, delay notice (only when the task allows customer messages),
// ask call-back, the "Asked from the customer" card, permission.

const actions = (offers: { action: string }[]) => [...new Set(offers.map((one) => one.action))];

describe('Send to customer: the menu', () => {
  let admin: Session;
  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('each place offers what fits it: a lead hides project-only actions, a lead with no site says why', async () => {
    const sale = await sellProject(admin, { name: 'Menu Places (test)' });
    const project = await optionsOf(admin, { projectId: sale.project.id });
    expect(project.canAskPaper).toBe(true);
    expect(actions(project.offers)).toEqual(
      expect.arrayContaining([
        'ask_location',
        'send_document',
        'payment_reminder',
        'ask_payment_proof',
        'ask_callback',
      ]),
    );
    const customer = await optionsOf(admin, { customerId: sale.customer.customerId });
    expect(customer.canAskPaper).toBe(false);
    expect(actions(customer.offers)).toContain('payment_reminder');
    const fresh = await newCustomer(admin, { name: 'Menu Lead (test)' });
    const lead = await optionsOf(admin, { leadId: fresh.leadId });
    expect(lead.canAskPaper).toBe(true);
    expect(actions(lead.offers)).toEqual(expect.arrayContaining(['ask_location', 'ask_callback']));
    for (const hidden of [
      'payment_reminder',
      'ask_payment_proof',
      'send_receipt',
      'share_crew',
      'delay_notice',
    ])
      expect(actions(lead.offers)).not.toContain(hidden);
    const noSite = await admin.post<{ id: string }>('/leads', {
      name: 'No Site (test)',
      phone: uniquePhone(),
      city: 'Sangli',
      nextActionOn: today(),
    });
    const none = await optionsOf(admin, { leadId: noSite.id });
    expect(none.offers).toEqual([]);
    expect(none.empty).toMatch(/Add the site/);
    // Someone who is not staff cannot use it.
    const customerSession = await Session.code(sale.customer.phone, 'customer');
    expect(
      (
        await customerSession.raw(
          'GET',
          `/send-to-customer/options?customerId=${sale.customer.customerId}`,
        )
      ).status,
    ).toBeGreaterThanOrEqual(401);
  });

  it('the preview is in the customer language and a document goes with its caption; outside 24 hours the template carries the file', async () => {
    const sale = await sellProject(admin, { name: 'Menu Document (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    await tap(customer.phone, 'lang:hi');
    const scope = { projectId: sale.project.id };
    const offers = (await optionsOf(admin, scope)).offers;
    expect(offers.find((one) => one.action === 'ask_callback')?.preview?.language).toBe('hi');
    expect(offers.find((one) => one.action === 'ask_callback')?.preview?.buttons).toEqual([
      'सुबह',
      'दोपहर',
      'शाम',
    ]);
    const quote = offers.find(
      (one) => one.action === 'send_document' && /quotation/i.test(one.label),
    );
    if (!quote?.request) throw new Error('no quotation offer');
    expect(quote.preview?.buttons).toEqual([]);
    expect((await sendTo(admin, scope, quote.request)).via).toBe('chat');
    const doc = await lastOf(customer.phone, 'document');
    expect(doc?.link).toMatch(/\/v1\/files\/shared\//);
    expect(doc?.caption).toBeTruthy();
    await closeChat(customer.phone);
    expect((await sendTo(admin, scope, quote.request)).via).toBe('template');
    const [message] = await templatesFor(customer.phone, 'document_share');
    expect(message?.payload).toMatchObject({ documentName: doc?.filename });
    const [audit] = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'customer.document_sent' AND entity_id = $1",
      [customer.customerId],
    );
    expect(audit).toBeDefined();
    // A file the customer cannot see is refused.
    const refused = await admin.raw('POST', '/send-to-customer', {
      scope,
      request: {
        action: 'send_document',
        paperId: 'document:00000000-0000-4000-8000-000000000000',
      },
    });
    expect(refused.status).toBe(409);
  });

  it('crew contact: the name and number for the work, no customer action', async () => {
    const sale = await sellProject(admin, { name: 'Menu Crew (test)' });
    const phone = uniquePhone();
    await rows('UPDATE users SET phone_e164 = $2 WHERE id = $1 AND phone_e164 IS NULL', [
      admin.userId,
      phone,
    ]);
    await openChat(sale.customer.phone, sale.customer.customerId);
    const scope = { projectId: sale.project.id };
    const crew = (await optionsOf(admin, scope)).offers.filter(
      (one) => one.action === 'share_crew',
    );
    const [first] = crew;
    if (!first?.request) {
      await rows('UPDATE users SET phone_e164 = NULL WHERE id = $1 AND phone_e164 = $2', [
        admin.userId,
        phone,
      ]);
      throw new Error('The admin has no phone to share.');
    }
    expect(first.preview?.body).toMatch(
      /^.+ from OneOhm will come for your \*.+\*\. You can call them on \+\d+\.$/,
    );
    await sendTo(admin, scope, first.request);
    expect((await lastReply(sale.customer.phone))?.body).toBe(first.preview?.body);
    expect(await actionsOf(sale.customer.customerId, 'pay')).toHaveLength(0);
    await closeChat(sale.customer.phone);
    await sendTo(admin, scope, first.request);
    expect((await templatesFor(sale.customer.phone, 'crew_contact')).at(-1)?.payload).toMatchObject(
      { phone: expect.stringMatching(/^\+/) },
    );
    await rows('UPDATE users SET phone_e164 = NULL WHERE id = $1 AND phone_e164 = $2', [
      admin.userId,
      phone,
    ]);
  });

  it('ask call-back: three buttons; a pick closes the action, sets the lead follow-up and tells the owner', async () => {
    const sale = await sellProject(admin, { name: 'Menu Callback (test)' });
    const { customer } = sale;
    await openChat(customer.phone, customer.customerId);
    // A customer with an open lead gets its next action set; a won lead has none to set.
    await rows("UPDATE leads SET stage = 'new' WHERE id = $1", [customer.leadId]);
    const scope = { projectId: sale.project.id };
    await sendTo(admin, scope, { action: 'ask_callback' });
    const ask = await lastOf(customer.phone, 'buttons');
    expect(ask?.buttons?.map((b) => b.title)).toEqual(['Morning', 'Afternoon', 'Evening']);
    const [action] = await actionsOf(customer.customerId, 'callback');
    expect(action?.status).toBe('open');
    await tap(customer.phone, `cb:${action?.id}:afternoon`);
    expect((await actionsOf(customer.customerId, 'callback'))[0]).toMatchObject({
      status: 'closed',
    });
    expect((await lastReply(customer.phone))?.body).toMatch(/will call you in the afternoon\.$/);
    const [lead] = await rows<{ next_action_time: string; next_action_note: string }>(
      'SELECT next_action_time, next_action_note FROM leads WHERE id = $1',
      [customer.leadId],
    );
    expect(lead).toMatchObject({ next_action_time: '14:00' });
    expect(lead?.next_action_note).toContain('afternoon');
    const [alert] = await rows(
      "SELECT 1 FROM notifications WHERE kind = 'callback_asked' AND dedupe_key LIKE $1",
      [`callback:${action?.id}%`],
    );
    expect(alert).toBeDefined();
    // A second tap on the same buttons is an old message.
    await tap(customer.phone, `cb:${action?.id}:morning`);
    expect((await lastReply(customer.phone))?.body).toMatch(/earlier message/);
  });
});
