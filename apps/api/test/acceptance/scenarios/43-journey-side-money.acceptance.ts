import { join } from 'node:path';
import type { LeadDetail, MessageTemplate, SalesReport } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { API, Session } from '../support/http';
import * as J from '../support/journey';
import { milestoneOf, signedWebhook } from '../support/money';
import { chatOf, leadsOf, tap, upToSite, withOnboarding } from '../support/onboarding';
import { createQuotation, newCustomer, sellProject, uniquePhone } from '../support/sales';
import { sendStatus } from '../support/whatsapp';

// The journey's side paths around money and messages (f-i): a website lead's UTM fields,
// an expired pay link, a file WhatsApp could not deliver, and the template extras switch
// off (Meta has not approved the file header and buttons yet).
/** The worker's own builder of what goes to Meta, loaded from its source (not an API package). */
const WORKER_TEMPLATES = join(__dirname, '../../../../worker/src/channels/message-templates.ts');
type Built = { header?: { kind: string; filename: string }; buttons?: { kind: string }[] };
type ApprovedMessage = (...args: [string, string[], unknown, unknown, boolean?]) => Built;

describe('The journey side paths: sources, links and messages', () => {
  let admin: Session;
  let restore: () => Promise<void>;
  let extrasWere = false;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
    extrasWere = await J.setExtras(admin, 'quotation_sent', false);
  });
  afterAll(async () => {
    await J.setExtras(admin, 'quotation_sent', extrasWere);
    await restore();
    await closeDb();
  });

  it('f) a website lead keeps its UTM fields; "By campaign" has a row for its UTM campaign', async () => {
    const phone = uniquePhone();
    const utm = `journey-utm-${phone.slice(-6)}`;
    const sent = await new Session().raw('POST', '/public/leads', {
      ...{ name: 'Utm Journey Visitor (test)', phone, city: 'Pune' },
      ...{ sourcePage: '/rooftop-solar', utmSource: 'google', utmMedium: 'cpc', utmCampaign: utm },
    });
    expect(sent.status).toBe(202);
    const [lead] = await leadsOf(phone);
    const detail = await admin.get<LeadDetail>(`/leads/${lead?.id}`);
    expect(detail.source).toBe('website');
    expect(detail.attribution).toMatchObject({
      ...{ utmSource: 'google', utmMedium: 'cpc', utmCampaign: utm },
      ...{ landingPage: '/rooftop-solar', campaignCode: null },
    });
    const report = await admin.get<SalesReport>('/business-reports/sales');
    expect(report.byCampaign.find((row) => row.key === `utm:${utm}`)).toMatchObject({
      label: utm,
      leads: 1,
    });
  });

  /** A sold project's advance, opened once on the pay page: its sandbox link id. */
  const openedAdvance = async (name: string) => {
    const { customer, project } = await sellProject(admin, { name });
    const [link] = await J.outboxOf(customer.phone, 'payment_link');
    const page = await fetch(`${API}/pay/due/${link?.payload.payToken}`, { redirect: 'manual' });
    const sandboxId = (page.headers.get('location') ?? '').split('/').pop() ?? '';
    return { customer, milestone: milestoneOf(project, 'quotation_accepted'), sandboxId };
  };
  const expire = (sandboxId: string) =>
    signedWebhook({
      event: 'payment_link.expired',
      payload: { payment_link: { entity: { id: sandboxId } } },
    });
  const fresh = (phone: string) =>
    rows<{ payload: Record<string, string> }>(
      `SELECT payload FROM outbox WHERE recipient = $1 AND dedupe_key LIKE 'link_expired:%'`,
      [phone],
    );

  it('g) an expired link (signed webhook) sends one fresh Pay now; a paid milestone gets none', async () => {
    const open = await openedAdvance('Journey Expired Link (test)');
    expect((await expire(open.sandboxId)).status).toBe(200);
    expect((await expire(open.sandboxId)).status).toBe(200);
    const [again, ...more] = await fresh(open.customer.phone);
    expect(more).toEqual([]);
    expect(again?.payload.payToken).toBeTruthy();
    expect(again?.payload.link).toContain('/v1/pay/due/');

    const paid = await openedAdvance('Journey Paid Link (test)');
    await fetch(`${API}/pay/sandbox/${paid.sandboxId}`, { method: 'POST' });
    const [status] = await rows<{ status: string }>(
      'SELECT status FROM payment_milestones WHERE id = $1',
      [paid.milestone.id],
    );
    expect(status?.status).toBe('paid');
    expect((await expire(paid.sandboxId)).status).toBe(200);
    expect(await fresh(paid.customer.phone)).toEqual([]);
  });

  it('h) Meta says a chat file failed: the lead owner is told the file could not be sent', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    for (const id of ['ob:site:home', 'ob:bill:2000_3000', 'ob:roof:rcc', 'ob:floors:1'])
      await tap(phone, id);
    await tap(phone, 'ob:photo:later');
    const wamid = `wamid.journey-file-${phone}`;
    await rows(
      `UPDATE outbox SET status = 'sent', provider_message_id = $2, delivery_status = 'sent'
        WHERE recipient = $1 AND template = 'session:document'`,
      [phone, wamid],
    );
    await sendStatus(wamid, 'failed');
    const chat = await chatOf(phone);
    const [lead] = await leadsOf(phone);
    const told = await rows<{ user_id: string; body: string }>(
      `SELECT user_id, body FROM notifications WHERE kind = 'whatsapp_file_failed' AND subject_id = $1`,
      [chat.id],
    );
    expect(told).toEqual([
      { user_id: lead?.owner_user_id, body: expect.stringContaining('could not be sent') },
    ]);
  });

  it('i) extras switch off: the quote payload keeps its fields, the delivery has no header or buttons', async () => {
    const templates = await admin.get<MessageTemplate[]>('/settings/message-templates');
    const template = templates.find((row) => row.key === 'quotation_sent');
    expect(template?.extrasApproved).toBe(false);
    const customer = await newCustomer(admin, { name: 'Journey Extras Off (test)' });
    await rows(
      `INSERT INTO wa_conversations (phone, customer_id, last_inbound_at) VALUES ($1, $2, now())`,
      [customer.phone, customer.customerId],
    );
    const quotation = await createQuotation(admin, customer);
    await admin.post(`/quotations/${quotation.id}/send`);
    const [sent] = await J.outboxOf(customer.phone, 'quotation_sent');
    expect(sent?.payload).toMatchObject({
      documentName: `${quotation.number}.pdf`,
      acceptPayload: `quote_accept:${quotation.id}`,
      askPayload: `quote_ask:${quotation.id}`,
    });
    expect(sent?.payload.documentUrl).toBeTruthy();
    // The chat is open, so the PDF still reaches the customer, as a chat file.
    expect(await J.outboxOf(customer.phone, 'session:document')).toHaveLength(1);
    if (!template) throw new Error('No quotation_sent template.');
    const { approvedMessage } = (await import(WORKER_TEMPLATES)) as {
      approvedMessage: ApprovedMessage;
    };
    // What the worker hands Meta for this row, with the switch as it is and as if it were on.
    const off = approvedMessage('quotation_sent', template.fields, template, sent?.payload);
    expect(off).not.toHaveProperty('header');
    expect(off).not.toHaveProperty('buttons');
    const on = approvedMessage('quotation_sent', template.fields, template, sent?.payload, true);
    expect(on.header).toMatchObject({ kind: 'document', filename: `${quotation.number}.pdf` });
    expect(on.buttons?.map((button) => button.kind)).toEqual(['quick_reply', 'quick_reply']);
  });
});
