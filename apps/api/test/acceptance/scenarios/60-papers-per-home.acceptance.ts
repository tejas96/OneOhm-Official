import type { DocumentChecklist } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { fileForm, upload } from '../support/files';
import { Session } from '../support/http';
import { chatOf, leadsOf, say, tap, withOnboarding } from '../support/onboarding';
import { createQuotation, discomId, sellProject, today, uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Every paper is kept with its home: a request answered in the app, a bill held in
// WhatsApp before the lead existed, and the lead's papers once the project is made.

interface ChatMessageRow {
  readonly direction: string;
  readonly file: { id: string } | null;
}

const documentOf = (id: string) =>
  rows<{ project_id: string | null; property_id: string | null }>(
    'SELECT project_id, property_id FROM documents WHERE id = $1',
    [id],
  );

describe('Papers per home', () => {
  let admin: Session;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('a request answered in the app is filed with its property', async () => {
    const { customer, project } = await sellProject(admin, { name: 'App Paper (test)' });
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: project.id,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
    });
    const app = await Session.code(customer.phone, 'customer');
    const answered = await app.post<{ id: string }>(
      `/customer/document-requests/${asked.id}/file`,
      await fileForm('document', {}),
    );
    expect(answered.id).toBe(asked.id);
    const [request] = await rows<{ document_id: string }>(
      'SELECT document_id FROM document_requests WHERE id = $1',
      [asked.id],
    );
    expect(await documentOf(request?.document_id ?? '')).toEqual([
      { project_id: project.id, property_id: customer.propertyId },
    ]);
  });

  it('lead papers move onto the project made from the lead', async () => {
    const phone = uniquePhone();
    const lead = await admin.post<{ id: string }>('/leads', {
      name: 'Lead Paper (test)',
      phone,
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    await sendInbound(phone, { media: { type: 'image', fileId: 'lead-bill-1' } });
    const [before] = await rows<{ id: string; project_id: string | null }>(
      'SELECT id, project_id FROM documents WHERE lead_id = $1',
      [lead.id],
    );
    expect(before?.project_id).toBeNull();
    const customer = await admin.post<{ customerId: string; propertyId: string }>(
      `/leads/${lead.id}/customer`,
      {
        kind: 'individual',
        property: {
          label: 'Site (test)',
          addressLine: '12 Vishrambag Road (test)',
          city: 'Sangli',
          district: 'Sangli',
          state: 'Maharashtra',
          pincode: '416416',
          subsidyCategory: 'individual',
          floors: 1,
        },
      },
    );
    const quotation = await createQuotation(
      admin,
      { leadId: lead.id, ...customer, phone, name: 'Lead Paper (test)' },
      {},
    );
    await admin.post(`/quotations/${quotation.id}/send`);
    await admin.post(`/quotations/${quotation.id}/accept`);
    const project = await admin.post<{ id: string }>('/projects', {
      quotationId: quotation.id,
      discomId: await discomId(admin, 'MSEDCL'),
      loan: false,
      loanPaise: 0,
      battery: false,
      groundMount: false,
      startDate: today(),
      managerUserId: admin.userId,
    });
    expect(await documentOf(before?.id ?? '')).toEqual([
      { project_id: project.id, property_id: customer.propertyId },
    ]);
  });

  it('a bill held before the lead shows in the chat once filed', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await sendInbound(phone, {
      media: { type: 'image', fileId: 'held-bill-1', mimeType: 'image/jpeg' },
    });
    await tap(phone, 'ob:name:yes');
    await tap(phone, 'ob:city:Pune');
    const [lead] = await leadsOf(phone);
    const [doc] = await rows<{ id: string }>('SELECT id FROM documents WHERE lead_id = $1', [
      lead?.id,
    ]);
    expect(doc).toBeDefined();
    const chat = await chatOf(phone);
    const detail = await admin.get<{ messages: ChatMessageRow[] }>(`/whatsapp/chats/${chat.id}`);
    const shown = detail.messages.filter((message) => message.direction === 'in' && message.file);
    expect(shown.map((message) => message.file?.id)).toEqual([doc?.id]);
  });

  it("a lead's bill outside onboarding alerts the lead owner", async () => {
    const phone = uniquePhone();
    const lead = await admin.post<{ id: string }>('/leads', {
      name: 'Owner Alert (test)',
      phone,
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    const [owned] = await rows<{ owner_user_id: string }>(
      'SELECT owner_user_id FROM leads WHERE id = $1',
      [lead.id],
    );
    await sendInbound(phone, { media: { type: 'image', fileId: 'owner-bill-1' } });
    const alerts = await rows(
      `SELECT id FROM notifications WHERE user_id = $1 AND title = 'New bill on WhatsApp'
          AND subject_id = $2`,
      [owned?.owner_user_id, lead.id],
    );
    expect(alerts).toHaveLength(1);
  });

  it('two projects on one property are one home, and a cancelled project is none', async () => {
    const first = await sellProject(admin, { name: 'Home Rule (test)' });
    const { customer } = first;
    const sell = async (propertyId: string) => {
      const quotation = await createQuotation(admin, { ...customer, propertyId });
      await admin.post(`/quotations/${quotation.id}/send`);
      await admin.post(`/quotations/${quotation.id}/accept`);
      return admin.post<{ id: string }>('/projects', {
        quotationId: quotation.id,
        discomId: await discomId(admin, 'MSEDCL'),
        loan: false,
        loanPaise: 0,
        battery: false,
        groundMount: false,
        startDate: today(),
        managerUserId: admin.userId,
      });
    };
    await sell(customer.propertyId);
    const farm = await admin.post<{ id: string }>(`/customers/${customer.customerId}/properties`, {
      label: 'Farm (test)',
      addressLine: '3 Canal Road (test)',
      city: 'Sangli',
      district: 'Sangli',
      state: 'Maharashtra',
      pincode: '416416',
      subsidyCategory: 'individual',
      floors: 1,
    });
    const onFarm = await sell(farm.id);
    await rows("UPDATE projects SET status = 'cancelled' WHERE id = $1", [onFarm.id]);
    // A bill filed for the customer with no home named counts only while there is one home.
    await upload(admin, 'document', {
      category: 'electricity_bill',
      customerId: customer.customerId,
    });
    const billCounts = async () => {
      const list = await admin.get<DocumentChecklist>(
        `/projects/${first.project.id}/document-checklist`,
      );
      return list.items.find((entry) => entry.key === 'bill')?.status;
    };
    expect(await billCounts()).toBe('present');
    await rows("UPDATE projects SET status = 'active' WHERE id = $1", [onFarm.id]);
    expect(await billCounts()).toBe('missing');
  });
});
