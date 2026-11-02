import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { createQuotation, newCustomer, uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// The WhatsApp quote-and-pay cycle: the quote reaches the customer as a file with buttons.
describe('WhatsApp quote and pay', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const newestOutbox = (phone: string, template: string) =>
    rows<{ payload: Record<string, string> }>(
      'select payload from outbox where recipient = $1 and template = $2 order by created_at desc limit 1',
      [phone, template],
    );

  it('sends the quote PDF and buttons with the quote message', async () => {
    const customer = await newCustomer(admin, { name: 'Quote Buttons Customer (test)' });
    const quotation = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quotation.id}/send`);

    const [sent] = await newestOutbox(customer.phone, 'quotation_sent');
    expect(sent?.payload.acceptPayload).toBe(`quote_accept:${quotation.id}`);
    expect(sent?.payload.askPayload).toBe(`quote_ask:${quotation.id}`);
    expect(sent?.payload.documentName).toMatch(/\.pdf$/);
    const file = await fetch(sent?.payload.documentUrl ?? '');
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toContain('application/pdf');
  });

  it('also sends the PDF as a chat file when the customer wrote in the last 24 hours', async () => {
    const customer = await newCustomer(admin, { name: 'Quote Open Window Customer (test)' });
    await rows(
      `insert into wa_conversations (phone, customer_id, last_inbound_at) values ($1, $2, now())`,
      [customer.phone, customer.customerId],
    );
    const quotation = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quotation.id}/send`);
    await admin.post(`/quotations/${quotation.id}/send`);

    const files = await rows<{ payload: { kind: string; filename: string } }>(
      "select payload from outbox where recipient = $1 and template = 'session:document'",
      [customer.phone],
    );
    expect(files).toHaveLength(1);
    expect(files[0]?.payload.filename).toBe(`${quotation.number}.pdf`);
  });

  it('sends no chat file when the customer has not written recently', async () => {
    const customer = await newCustomer(admin, { name: 'Quote Closed Window Customer (test)' });
    const quotation = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quotation.id}/send`);
    const files = await rows(
      "select 1 from outbox where recipient = $1 and template = 'session:document'",
      [customer.phone],
    );
    expect(files).toHaveLength(0);
  });

  it('lists a sent, not yet accepted quote in the Documents answer', async () => {
    const customer = await newCustomer(admin, { name: 'Quote Documents Customer (test)' });
    const quotation = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quotation.id}/send`);

    await sendInbound(customer.phone, { text: 'documents' });

    const [reply] = await rows<{ text: string }>(
      "select payload::text as text from outbox where recipient = $1 and template like 'session:%' order by created_at desc limit 1",
      [customer.phone],
    );
    expect(reply?.text).toContain(quotation.number);
    expect(reply?.text).toContain('/v1/files/shared/');
  });

  const sentQuote = async (name: string) => {
    const customer = await newCustomer(admin, { name });
    const quotation = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quotation.id}/send`);
    return { customer, quotation };
  };
  const statusOf = async (id: string) =>
    (await rows<{ status: string }>('select status from quotations where id = $1', [id]))[0]
      ?.status;
  const chatState = async (phone: string) =>
    (
      await rows<{ state: string }>('select state from wa_conversations where phone = $1', [phone])
    )[0]?.state;
  const acceptances = (id: string) =>
    rows<{ actor_user_id: string | null; by: string }>(
      "select actor_user_id, data->>'by' as by from audit_log where action = 'quotation.accepted' and entity_id = $1",
      [id],
    );
  const thanks = (id: string) =>
    rows('select 1 from outbox where dedupe_key = $1', [`quote_thanks:${id}`]);

  it('asks to confirm, then accepts on yes', async () => {
    const { customer, quotation } = await sentQuote('Quote Accept Customer (test)');

    await sendInbound(customer.phone, { buttonPayload: `quote_accept:${quotation.id}` });
    const [ask] = await rows<{ payload: { kind: string; buttons: { id: string }[] } }>(
      "select payload from outbox where recipient = $1 and template like 'session:%' order by created_at desc limit 1",
      [customer.phone],
    );
    expect(ask?.payload.kind).toBe('buttons');
    expect(ask?.payload.buttons.map((button) => button.id)).toEqual([
      `quote_yes:${quotation.id}`,
      `quote_ask:${quotation.id}`,
    ]);
    expect(await statusOf(quotation.id)).toBe('sent');

    await sendInbound(customer.phone, { buttonPayload: `quote_yes:${quotation.id}` });
    expect(await statusOf(quotation.id)).toBe('accepted');
    expect(await acceptances(quotation.id)).toEqual([{ actor_user_id: null, by: 'customer' }]);
    const [lead] = await rows<{ stage: string; owner: string | null }>(
      'select stage, owner_user_id as owner from leads where id = $1',
      [customer.leadId],
    );
    expect(lead?.stage).toBe('won');
    const told = await rows<{ user_id: string }>(
      'select user_id from notifications where dedupe_key like $1',
      [`quote_accepted:${quotation.id}%`],
    );
    const setUp = await rows<{ id: string }>(
      `select distinct u.id from users u join user_roles ur on ur.user_id = u.id
       join roles r on r.id = ur.role_id and r.archived_at is null
       join role_capabilities rc on rc.role_id = r.id
       where u.status = 'active' and rc.capability = 'projects.create'`,
    );
    const toldIds = told.map((row) => row.user_id);
    expect(lead?.owner).toBeTruthy();
    expect(toldIds).toContain(lead?.owner);
    for (const holder of setUp) expect(toldIds).toContain(holder.id);
    expect(await thanks(quotation.id)).toHaveLength(1);
  });

  it('accepts once when the yes arrives twice', async () => {
    const { customer, quotation } = await sentQuote('Quote Twice Customer (test)');
    const yes = { buttonPayload: `quote_yes:${quotation.id}`, id: `wamid.twice-${quotation.id}` };

    // Two taps handled at the same moment, then Meta delivering the first one again.
    await Promise.all([
      sendInbound(customer.phone, yes),
      sendInbound(customer.phone, { buttonPayload: `quote_yes:${quotation.id}` }),
    ]);
    await sendInbound(customer.phone, yes);

    expect(await statusOf(quotation.id)).toBe('accepted');
    expect(await acceptances(quotation.id)).toHaveLength(1);
    expect(await thanks(quotation.id)).toHaveLength(1);
  });

  it('refuses an old revision and hands over', async () => {
    const { customer, quotation: first } = await sentQuote('Quote Old Revision Customer (test)');
    const second = await createQuotation(admin, customer, { targetWp: 4000 });
    await admin.post(`/quotations/${second.id}/send`);
    const before = await statusOf(first.id);

    await sendInbound(customer.phone, { buttonPayload: `quote_yes:${first.id}` });

    expect(await statusOf(first.id)).toBe(before);
    expect(await statusOf(second.id)).toBe('sent');
    expect(await acceptances(first.id)).toHaveLength(0);
    expect(await chatState(customer.phone)).toBe('human');
  });

  it('hands a family number to a person', async () => {
    const { customer, quotation } = await sentQuote('Quote Family Customer (test)');
    const family = uniquePhone();
    await rows(
      `insert into customer_contacts (customer_id, name, phone_e164, relation) values ($1, 'Family (test)', $2, 'son')`,
      [customer.customerId, family],
    );

    await sendInbound(family, { buttonPayload: `quote_yes:${quotation.id}` });

    expect(await statusOf(quotation.id)).toBe('sent');
    expect(await acceptances(quotation.id)).toHaveLength(0);
    expect(await chatState(family)).toBe('human');
  });
});
