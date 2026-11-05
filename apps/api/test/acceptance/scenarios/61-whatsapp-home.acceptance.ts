import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { endsWithTaps } from '../support/menu-chat';
import { choices, lastReply, replies, say, tap } from '../support/onboarding';
import { createQuotation, newCustomer, type Sale, sellProject } from '../support/sales';

// Redesign phase 1a (4 Nov 2026), end to end over the webhook: "hi" shows Home (what
// matters now and three buttons), More lists the ten rows, a paper ask is one tap, and
// Pay ₹X answers with the pay link. Small talk, unknown words, late taps, language and
// hand-back: 61-whatsapp-home-talk.
describe('WhatsApp Home (redesign §3)', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** A sold customer (the advance is due) with no paper asked of them yet. */
  async function soldCustomer(name: string): Promise<Sale> {
    const sale = await sellProject(admin, { name });
    await rows(
      `UPDATE customer_actions SET status = 'cancelled', cancelled_at = now() WHERE customer_id = $1`,
      [sale.customer.customerId],
    );
    return sale;
  }

  const askPaper = (sale: Sale) =>
    admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
    });

  it('hi with the advance due: Hi {name}, the amount due and [Pay ₹X] [Project update] [More]', async () => {
    const sale = await soldCustomer('asha pay customer (test)');
    const { phone } = sale.customer;
    await say(phone, 'Hello!');
    const home = await endsWithTaps(phone);
    expect(home?.kind).toBe('buttons');
    expect(home?.body).toMatch(/^Hi Asha 👋 Your Sangli solar is at \*/);
    expect(home?.body).toMatch(/\*₹[\d,]+\* is due for your .+ home\./);
    const [pay, ...rest] = choices(home);
    expect(pay).toMatch(/^pay:/);
    expect(home?.buttons?.[0]?.title).toMatch(/^Pay ₹[\d,]+$/);
    expect(rest).toEqual(['go:update', 'go:more']);

    // [Pay ₹X] answers with the pay-link message (a link button sits alone, redesign §1).
    await tap(phone, pay ?? '');
    const link = await lastReply(phone);
    expect(link?.kind).toBe('cta_url');
    expect(JSON.stringify(link)).toContain('/pay/due/');
  });

  it('hi with a paper asked: We need your paper, and [Send it now] names it and the home', async () => {
    const sale = await soldCustomer('Paper Home Customer (test)');
    const { phone } = sale.customer;
    const asked = await askPaper(sale);
    await say(phone, 'hi');
    const home = await endsWithTaps(phone);
    expect(home?.body).toContain('We need your *Electricity bill (test)* for your');
    expect(home?.body).toContain('2 things need you.');
    expect(choices(home)).toEqual([`sendit:${asked.id}`, 'go:see', 'go:more']);

    await tap(phone, `sendit:${asked.id}`);
    const prompt = await endsWithTaps(phone);
    expect(prompt?.body).toMatch(
      /^Please send your \*Electricity bill \(test\)\* for your .+ home here as a photo or PDF\.$/,
    );
    expect(choices(prompt)).toEqual(['menu']);
  });

  it('two things need them: [See them] lists both, each opening its answer', async () => {
    const sale = await soldCustomer('See Them Customer (test)');
    const { phone } = sale.customer;
    const asked = await askPaper(sale);
    await say(phone, 'hi');
    await tap(phone, 'go:see');
    const list = await lastReply(phone);
    expect(list?.kind).toBe('list');
    const ids = choices(list);
    expect(ids[0]).toBe(`sendit:${asked.id}`);
    expect(ids[1]).toMatch(/^pay:/);
    expect(list?.rows?.[0]?.title).toBe('Electricity bill (test)');
  });

  it('More lists the ten rows, Talk to {name} among them, each ending with taps', async () => {
    const sale = await soldCustomer('More Rows Customer (test)');
    const { phone } = sale.customer;
    await say(phone, 'menu');
    await tap(phone, 'go:more');
    const more = await lastReply(phone);
    expect(more?.kind).toBe('list');
    const titles = more?.rows?.map((row) => row.title) ?? [];
    expect(titles).toHaveLength(10);
    expect(titles.slice(0, 8)).toEqual([
      'Project update',
      'Payments',
      'Documents',
      'Send a paper',
      'Report a problem',
      'My problems',
      'Warranty & AMC',
      'Refer a friend',
    ]);
    expect(titles[8]).toMatch(/^Talk to /);
    expect(titles[9]).toBe('Language');
    expect(choices(more)).not.toContain('menu');

    // Project update: the steps ticked, then Payments and Menu.
    await tap(phone, 'go:update');
    const update = await endsWithTaps(phone);
    expect(update?.body).toContain('▶️');
    expect(choices(update)).toEqual(['go:payments', 'menu']);
    // Send a paper with nothing asked: send it and tell us what it is.
    await tap(phone, 'go:paper');
    expect((await lastReply(phone))?.body).toBe(
      'Send the photo or PDF here and tell us what it is.',
    );
    // Rewards offers a real Refer a friend button.
    await tap(phone, 'go:rewards');
    expect(choices(await lastReply(phone))).toEqual(['go:refer', 'menu']);
  });

  it('no number shortcuts: "2" is not Payments any more (decision 8)', async () => {
    const sale = await soldCustomer('No Shortcut Customer (test)');
    const { phone } = sale.customer;
    await say(phone, 'hi');
    await say(phone, '2');
    expect((await lastReply(phone))?.body).toBe('Sorry, we didn’t get that. Pick one below.');
    expect((await replies(phone)).some((reply) => reply.body.includes('🔴'))).toBe(false);
  });

  it('a quote waiting: [See quotation] sends the PDF and its Accept / question buttons', async () => {
    const customer = await newCustomer(admin, { name: 'Quote Home Customer (test)' });
    const quote = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quote.id}/send`);
    await say(customer.phone, 'hi');
    const home = await endsWithTaps(customer.phone);
    expect(home?.body).toContain('Your quotation is waiting for your answer.');
    expect(choices(home)[0]).toBe(`quote_show:${quote.id}`);
    await tap(customer.phone, `quote_show:${quote.id}`);
    const [file, buttons] = (await replies(customer.phone)).slice(-2);
    expect(file?.kind).toBe('document');
    expect(choices(buttons)).toEqual([`quote_accept:${quote.id}`, `quote_ask:${quote.id}`]);
  });

  it('[See quotation] on a quote past its last day says it has changed, with no Accept', async () => {
    const customer = await newCustomer(admin, { name: 'Expired Quote Customer (test)' });
    const quote = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quote.id}/send`);
    await say(customer.phone, 'hi');
    await rows(`UPDATE quotations SET valid_until = current_date - 1 WHERE id = $1`, [quote.id]);
    await tap(customer.phone, `quote_show:${quote.id}`);
    const sent = await replies(customer.phone);
    expect(sent.some((reply) => reply.body.includes('has changed — here is the latest'))).toBe(
      true,
    );
    expect(sent.some((reply) => JSON.stringify(reply).includes(`quote_accept:${quote.id}`))).toBe(
      false,
    );
  });

  it('a typed "bill" asks which: a photo of their bill, our invoice, or Payments', async () => {
    const sale = await soldCustomer('Which Bill Customer (test)');
    await say(sale.customer.phone, 'hi');
    await say(sale.customer.phone, 'bill');
    const ask = await endsWithTaps(sale.customer.phone);
    expect(ask?.body).toBe('Which bill do you mean?');
    expect(choices(ask)).toEqual(['go:sendbill', 'go:invoices', 'go:payments']);
    // Typing a button's title is that button, not the question again.
    await say(sale.customer.phone, 'Our invoice');
    expect((await lastReply(sale.customer.phone))?.body).not.toBe('Which bill do you mean?');
    await tap(sale.customer.phone, 'go:sendbill');
    expect((await lastReply(sale.customer.phone))?.body).toBe(
      'Please send your *electricity bill* here as a photo or PDF.',
    );
  });
});
