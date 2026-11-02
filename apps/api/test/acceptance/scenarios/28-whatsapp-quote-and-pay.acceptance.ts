import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { createQuotation, newCustomer } from '../support/sales';
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
});
