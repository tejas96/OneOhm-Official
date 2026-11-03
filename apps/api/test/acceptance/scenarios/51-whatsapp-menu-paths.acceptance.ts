import type { Property, QuotationDetail } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { milestoneOf } from '../support/money';
import { chatOf, choices, lastReply, replies, say, tap } from '../support/onboarding';
import { discomId, quoteInput, type Sale, sellProject, today, uniquePhone } from '../support/sales';

// The WhatsApp menu audit (3 Nov 2026), end to end over the webhook: every menu path the
// customer taps ends with taps; a tap is never taken as the words a step waits for; typed
// words the bot does not know reach a person; a person's hold survives the bot's own flows.
describe('WhatsApp menu paths', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** The bot's last reply offers taps (buttons or list rows): the way forward. */
  const endsWithTaps = async (phone: string) => {
    const reply = await lastReply(phone);
    expect(choices(reply).length, reply?.body).toBeGreaterThan(0);
    return reply;
  };
  const requestsOf = (customerId: string) =>
    rows<{ project_id: string | null; description: string }>(
      'SELECT project_id, description FROM service_requests WHERE customer_id = $1',
      [customerId],
    );
  const alerts = (chatId: string, kind: string) =>
    rows('SELECT 1 FROM notifications WHERE kind = $1 AND subject_id = $2', [kind, chatId]);

  /** A sold customer who said hello: the menu is the last reply. */
  async function customerInChat(name: string): Promise<Sale> {
    const sale = await sellProject(admin, { name });
    await say(sale.customer.phone, 'hi');
    expect((await lastReply(sale.customer.phone))?.kind).toBe('list');
    return sale;
  }

  /** A second home (in Pune) with its own project, for the same customer. */
  async function secondHome(sale: Sale): Promise<string> {
    const site = await admin.post<Property>(`/customers/${sale.customer.customerId}/properties`, {
      label: 'Farm house (test)',
      addressLine: '9 Baner Road (test)',
      city: 'Pune',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '411045',
      subsidyCategory: 'individual',
      floors: 1,
    });
    const quote = await admin.post<QuotationDetail>('/quotations', {
      propertyId: site.id,
      leadId: null,
      ...(await quoteInput(admin)),
    });
    await admin.post(`/quotations/${quote.id}/send`);
    await admin.post(`/quotations/${quote.id}/accept`);
    const project = await admin.post<{ id: string }>('/projects', {
      quotationId: quote.id,
      discomId: await discomId(admin, 'MSEDCL'),
      loan: false,
      lenderName: null,
      loanPaise: 0,
      battery: false,
      groundMount: false,
      startDate: today(),
      managerUserId: admin.userId,
    });
    return project.id;
  }

  it('Raise a complaint: a tap while waiting is that tap; the words raise it on the home', async () => {
    const sale = await customerInChat('Menu Complaint Customer (test)');
    const { phone, customerId } = sale.customer;

    await tap(phone, 'service');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    expect((await chatOf(phone)).state).toBe('await_problem');

    // H1: a menu row tapped while the bot waits is that row, never the complaint.
    await tap(phone, 'requests');
    expect((await endsWithTaps(phone))?.body).toBe('You have no service requests.');
    expect(await requestsOf(customerId)).toHaveLength(0);
    expect((await chatOf(phone)).state).toBe('menu');

    await tap(phone, 'service');
    await say(phone, 'ok');
    // Too short: asked again, with Menu to leave.
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    await say(phone, 'Inverter shows an error since morning (test)');
    expect(choices(await endsWithTaps(phone))).toEqual(['requests', 'menu']);
    const [raised] = await requestsOf(customerId);
    expect(raised?.project_id).toBe(sale.project.id);

    // My requests lists it, and ends with taps.
    await tap(phone, 'requests');
    expect((await endsWithTaps(phone))?.body).toContain('Inverter shows an error');
  });

  it('Raise a complaint with two homes asks which home first, then files on that one', async () => {
    const sale = await customerInChat('Menu Two Homes Customer (test)');
    const { phone, customerId } = sale.customer;
    const pune = await secondHome(sale);

    await tap(phone, 'service');
    const list = await endsWithTaps(phone);
    expect(list?.kind).toBe('list');
    expect(list?.body).toBe('Which home is the problem at?');
    expect(choices(list).sort()).toEqual(
      [`home:${pune}`, `home:${sale.project.id}`, 'menu'].sort(),
    );
    expect(list?.rows?.map((row) => row.title)).toEqual(['Pune', 'Sangli', 'Back to menu']);

    await tap(phone, `home:${pune}`);
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    await say(phone, 'No power from the panels today (test)');
    const [raised] = await requestsOf(customerId);
    expect(raised?.project_id).toBe(pune);
  });

  it('Warranty and AMC, My rewards and Payments each end with taps', async () => {
    const { customer } = await customerInChat('Menu Answers Customer (test)');
    const phone = customer.phone;

    await tap(phone, 'warranty');
    expect((await endsWithTaps(phone))?.body).toContain('switched on');
    await tap(phone, 'rewards');
    expect((await endsWithTaps(phone))?.body).toContain('not referred anyone');
    // M3: after the Pay now link buttons, Menu · Talk to us.
    await tap(phone, 'payments');
    const sent = await replies(phone);
    expect(sent.some((reply) => reply.kind === 'cta_url')).toBe(true);
    expect(choices(await endsWithTaps(phone))).toEqual(['menu', 'human']);
  });

  it('Refer a friend: a tap while waiting is that tap; the friend is saved and shown', async () => {
    const { customer } = await customerInChat('Menu Referral Customer (test)');
    const phone = customer.phone;

    await tap(phone, 'refer');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    // H2: a tap is not the friend's name and number.
    await tap(phone, 'rewards');
    expect((await endsWithTaps(phone))?.body).toContain('not referred anyone');
    expect((await chatOf(phone)).state).toBe('menu');

    await tap(phone, 'refer');
    await say(phone, 'no idea');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    await say(phone, `Suresh Patil ${uniquePhone().slice(-10)}`);
    expect((await endsWithTaps(phone))?.body).toContain('We will call Suresh');
    await tap(phone, 'rewards');
    expect((await endsWithTaps(phone))?.body).toContain('Suresh');
  });

  it('a rating while a person has the chat is saved, and the person keeps the chat', async () => {
    const sale = await customerInChat('Menu Held Rating Customer (test)');
    const { phone, customerId } = sale.customer;
    await rows(`UPDATE projects SET status = 'operational' WHERE id = $1`, [sale.project.id]);
    const chat = await chatOf(phone);
    await admin.post(`/whatsapp/chats/${chat.id}/reply`, { text: 'Hello from the office (test)' });

    await tap(phone, 'feedback');
    expect(choices(await endsWithTaps(phone))).toContain('rate:4');
    await tap(phone, 'rate:4');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    await say(phone, 'Great team (test)');
    expect((await endsWithTaps(phone))?.body).toContain('noted');
    const saved = await rows<{ rating: number; comment: string | null }>(
      'SELECT rating, comment FROM customer_feedback WHERE customer_id = $1',
      [customerId],
    );
    expect(saved).toEqual([{ rating: 4, comment: 'Great team (test)' }]);

    // M6: Raise a complaint runs as the bot's flow inside the hold, and the hold stays.
    await tap(phone, 'service');
    await say(phone, 'Meter reading looks wrong (test)');
    expect(await requestsOf(customerId)).toHaveLength(1);
    expect((await chatOf(phone)).state).toBe('human');
    expect(await alerts(chat.id, 'whatsapp_message')).toHaveLength(0);
  });

  it('Talk to a person, and a typed question, reach a person with a Menu tap', async () => {
    const { customer } = await customerInChat('Menu Talk Customer (test)');
    const phone = customer.phone;
    const chat = await chatOf(phone);

    await tap(phone, 'human');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    expect((await chatOf(phone)).state).toBe('human');
    await tap(phone, 'menu');

    // M11: words the bot does not know go to a person, warmly, never "Sorry".
    await say(phone, 'When will the technician come to clean the panels? (test)');
    const reply = await endsWithTaps(phone);
    expect(reply?.body).toContain('will reply to you here');
    expect(choices(reply)).toEqual(['menu']);
    expect((await chatOf(phone)).state).toBe('human');
    expect((await alerts(chat.id, 'whatsapp_handover')).length).toBeGreaterThan(0);
  });

  it('a cancelled home offers no Pay now; an old receipt is still sent by View receipt', async () => {
    const sale = await customerInChat('Menu Receipt Customer (test)');
    const { phone } = sale.customer;
    const advance = milestoneOf(sale.project, 'quotation_accepted');
    for (let round = 0; round < 4; round += 1)
      await admin.post(`/projects/${sale.project.id}/payments`, {
        milestoneId: advance.id,
        amountPaise: 100_000,
        method: 'cash',
        receivedOn: today(),
        reference: `CASH-${round} (test)`,
      });
    const [oldest] = await rows<{ id: string; receipt_number: string }>(
      'SELECT id, receipt_number FROM payments WHERE project_id = $1 ORDER BY created_at LIMIT 1',
      [sale.project.id],
    );
    // M12: older than the newest three, and still sent itself.
    await tap(phone, `paper:receipt:${oldest?.id}`);
    const file = (await replies(phone)).filter((reply) => reply.kind === 'document').at(-1);
    expect(file?.caption).toContain(oldest?.receipt_number);
    await endsWithTaps(phone);

    // M7: with only a cancelled home there is no project to pay or track.
    await rows(`UPDATE projects SET status = 'cancelled' WHERE id = $1`, [sale.project.id]);
    await tap(phone, 'progress');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu', 'human']);
    await tap(phone, 'payments');
    expect((await lastReply(phone))?.kind).not.toBe('cta_url');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu', 'human']);
  });

  it('typed words from a lead the team made reach its person (menu audit M13)', async () => {
    const phone = uniquePhone();
    await admin.post('/leads', {
      name: 'Menu Staff Lead (test)',
      phone,
      city: 'Sangli',
      nextActionOn: today(),
    });
    await say(phone, 'Is the price the same as last week? (test)');
    const reply = await endsWithTaps(phone);
    expect(reply?.body).toContain('will reply to you here');
    expect(reply?.body).not.toContain('not linked');
    expect((await chatOf(phone)).state).toBe('human');
  });
});
