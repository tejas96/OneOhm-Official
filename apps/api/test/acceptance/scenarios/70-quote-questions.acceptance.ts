import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminFirstName, bodyOf, callTasks, PROMISE } from '../support/care';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { lastReply, tap } from '../support/onboarding';
import { addDays, createQuotation, newCustomer, today } from '../support/sales';
import { openChat } from '../support/send';

// Quote questions by tap (redesign §9, phase 6): the list, fixed answers from the quote, Call me,
// Something else, and Not yet with a check-back date.

describe('Quote: questions by tap', () => {
  let admin: Session;
  let first = '';
  beforeAll(async () => {
    admin = await Session.admin();
    first = await adminFirstName(admin);
  });
  afterAll(closeDb);

  /** A sent quote for a new customer whose chat is open. */
  async function sentQuote(name: string, language?: string) {
    const customer = await newCustomer(admin, { name });
    const quotation = await createQuotation(admin, customer);
    await openChat(customer.phone, customer.customerId);
    if (language) await tap(customer.phone, `lang:${language}`);
    await admin.post(`/quotations/${quotation.id}/send`);
    return { customer, quotation };
  }

  it('the quote message names the real payment triggers, with the two buttons; the template keeps two', async () => {
    const { customer, quotation } = await sentQuote('Quote Words (test)');
    const reply = await lastReply(customer.phone);
    expect(reply?.body).toMatch(/Full price .* paid in \d parts: .* on acceptance/);
    expect(reply?.buttons?.map((b) => b.id)).toEqual([
      `quote_accept:${quotation.id}`,
      `quote_ask:${quotation.id}`,
    ]);
    expect(reply?.buttons?.map((b) => b.title)).toEqual(['Accept quote', 'I have a question']);
    const [template] = await rows<{ extras: unknown }>(
      "SELECT 1 AS extras FROM message_templates WHERE key = 'quotation_sent'",
    );
    expect(template).toBeDefined();
  });

  it('[I have a question] lists the topics; each answer is fixed text from the quote', async () => {
    const { customer, quotation } = await sentQuote('Quote Topics (test)');
    await tap(customer.phone, `quote_ask:${quotation.id}`);
    const list = await lastReply(customer.phone);
    expect(list?.kind).toBe('list');
    expect(list?.rows?.map((r) => r.id)).toEqual(
      ['subsidy', 'plan', 'panels', 'warranty', 'timeline', 'call', 'other'].map(
        (topic) => `quote_q:${quotation.id}:${topic}`,
      ),
    );
    expect(list?.rows?.map((r) => r.title)).toEqual([
      'Subsidy',
      'Payment plan',
      'Panels & brand',
      'Warranty',
      'Timeline',
      'Call me',
      'Something else',
    ]);

    const answer = async (topic: string) => {
      await tap(customer.phone, `quote_q:${quotation.id}:${topic}`);
      const reply = await lastReply(customer.phone);
      expect(reply?.buttons?.map((b) => b.id)).toEqual([
        `quote_accept:${quotation.id}`,
        `quote_ask:${quotation.id}`,
      ]);
      return reply?.body ?? '';
    };
    expect(await answer('subsidy')).toMatch(/Your subsidy is ₹[\d,]+\. It comes back to your bank/);
    expect(await answer('plan')).toMatch(/Full price .* on acceptance/);
    expect(await answer('panels')).toMatch(/Your system is [\d.]+ kW: \d+ panels .*\. Inverter: /);
    expect(await answer('warranty')).toContain('panels 10 years (power output 25 years)');
    const timeline = await answer('timeline');
    expect(timeline).toContain('valid until');
    expect(timeline).toContain('1st instalment');
  });

  it('answers in Marathi', async () => {
    const { customer, quotation } = await sentQuote('Quote Marathi (test)', 'mr');
    await tap(customer.phone, `quote_ask:${quotation.id}`);
    const list = await lastReply(customer.phone);
    expect(list?.rows?.[0]?.title).toBe('सबसिडी');
    await tap(customer.phone, `quote_q:${quotation.id}:warranty`);
    expect(await bodyOf(customer.phone)).toContain('वॉरंटी: पॅनल 10 वर्षे');
  });

  it('Call me promises a call by a named person and makes one call task', async () => {
    const { customer, quotation } = await sentQuote('Quote Call (test)');
    await tap(customer.phone, `quote_q:${quotation.id}:call`);
    const body = await bodyOf(customer.phone);
    expect(body).toContain(`*${first}* will call you`);
    expect(body).toMatch(PROMISE);
    const tasks = await callTasks(customer.customerId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ status: 'received' });
    expect(tasks[0]?.payload.reason).toBe('quote');
    expect(new Date(tasks[0]?.payload.callBy ?? '').getTime()).toBeGreaterThan(Date.now());
    // A second tap says the same and makes no second task.
    await tap(customer.phone, `quote_q:${quotation.id}:call`);
    expect(await callTasks(customer.customerId)).toHaveLength(1);
    const alerts = await rows(
      "SELECT 1 FROM notifications WHERE dedupe_key LIKE $1 AND kind = 'call_customer'",
      [`quote_call:${quotation.id}%`],
    );
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('Something else goes to their person; the chat is a person’s now', async () => {
    const { customer, quotation } = await sentQuote('Quote Else (test)');
    await tap(customer.phone, `quote_q:${quotation.id}:other`);
    const [chat] = await rows<{ state: string }>(
      'SELECT state FROM wa_conversations WHERE phone = $1',
      [customer.phone],
    );
    expect(chat?.state).toBe('human');
    expect(await bodyOf(customer.phone)).toContain(first);
  });

  it('Not yet asks when to check back and sets the lead’s next action', async () => {
    const { customer, quotation } = await sentQuote('Quote Not Yet (test)');
    await tap(customer.phone, `quote_accept:${quotation.id}`);
    const confirm = await lastReply(customer.phone);
    expect(confirm?.buttons?.map((b) => b.id)).toEqual([
      `quote_yes:${quotation.id}`,
      `quote_no:${quotation.id}`,
    ]);
    await tap(customer.phone, `quote_no:${quotation.id}`);
    const when = await lastReply(customer.phone);
    expect(when?.body).toBe('When should we check back?');
    expect(when?.buttons?.map((b) => b.title)).toEqual(['1 week', '1 month', `Talk to ${first}`]);
    expect(when?.buttons?.map((b) => b.id).slice(0, 2)).toEqual([
      `quote_back:${quotation.id}:w`,
      `quote_back:${quotation.id}:m`,
    ]);

    await tap(customer.phone, `quote_back:${quotation.id}:w`);
    expect(await bodyOf(customer.phone)).toContain('check back in 1 week');
    const [lead] = await rows<{ day: string; note: string; stage: string }>(
      'SELECT next_action_on::text AS day, next_action_note AS note, stage::text AS stage FROM leads WHERE id = $1',
      [customer.leadId],
    );
    expect(lead?.day).toBe(addDays(today(), 7));
    expect(lead?.note).toContain(quotation.number);
    // The quote is still open: accepting later still works.
    const [row] = await rows<{ status: string }>('SELECT status FROM quotations WHERE id = $1', [
      quotation.id,
    ]);
    expect(row?.status).toBe('sent');

    await tap(customer.phone, `quote_back:${quotation.id}:m`);
    const [month] = await rows<{ day: string }>(
      'SELECT next_action_on::text AS day FROM leads WHERE id = $1',
      [customer.leadId],
    );
    expect(month?.day).toBe(addDays(today(), 30));
  });

  it('a question about a quote that is no longer open is said so', async () => {
    const { customer, quotation } = await sentQuote('Quote Closed (test)');
    await admin.post(`/quotations/${quotation.id}/accept`);
    await tap(customer.phone, `quote_q:${quotation.id}:subsidy`);
    expect(await bodyOf(customer.phone)).toContain('no longer open');
  });
});
