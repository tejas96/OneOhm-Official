import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { createQuotation, newCustomer } from '../support/sales';

// The quote PDF as a chat file: only when the chat window is open and the template has no file slot.
describe('WhatsApp quote chat file', () => {
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

  it('sends no extra chat file when the template already carries the file', async () => {
    await rows(
      `insert into message_templates (key, audience, meta_name, fields, preview, extras_approved)
       values ('quotation_sent', 'customer', 'quotation_sent_v2', '{}', 'x', true)
       on conflict (key) do update set extras_approved = true`,
    );
    try {
      const customer = await newCustomer(admin, { name: 'Quote Switch On Customer (test)' });
      await rows(
        `insert into wa_conversations (phone, customer_id, last_inbound_at) values ($1, $2, now())`,
        [customer.phone, customer.customerId],
      );
      const quotation = await createQuotation(admin, customer);
      await admin.post(`/quotations/${quotation.id}/send`);
      const [sent] = await newestOutbox(customer.phone, 'quotation_sent');
      expect(sent?.payload.documentUrl).toBeTruthy();
      const files = await rows(
        "select 1 from outbox where recipient = $1 and template = 'session:document'",
        [customer.phone],
      );
      expect(files).toHaveLength(0);
    } finally {
      await rows(
        "update message_templates set extras_approved = false where key = 'quotation_sent'",
      );
    }
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
});
