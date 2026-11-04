import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { fileForm, upload } from '../support/files';
import { sellOn } from '../support/homes';
import { Session } from '../support/http';
import { lastReply, say, tap } from '../support/onboarding';
import { newCustomer, sellProject } from '../support/sales';
import { askAboutFiles } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// Customer actions, review round 1: long titles, who sees what, ask again from closed or
// after a staff upload, papers nobody asked for, and asking on a lead.

interface Item {
  key: string;
  check: string | null;
  requested: boolean;
}
interface Mine {
  id: string;
  note: string;
  status: string;
}

const actionOf = async (id: string) =>
  (
    await rows<{ status: string; document_id: string | null }>(
      'SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1',
      [id],
    )
  )[0];

describe('Customer actions: review round 1', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const ask = (projectId: string, title: string, extra: Record<string, string> = {}) =>
    admin.post<{ id: string }>('/document-requests', {
      projectId,
      category: 'customer_kyc',
      title,
      ...extra,
    });

  it('a long title asked freely is accepted (its key is longer than 60)', async () => {
    const { project } = await sellProject(admin, { name: 'Long Title (test)' });
    const title = 'Latest electricity bill showing consumer number';
    const key = `free:electricity_bill:${title.toLowerCase()}`;
    expect(key.length).toBeGreaterThan(60);
    const made = await admin.raw('POST', '/document-requests', {
      projectId: project.id,
      category: 'electricity_bill',
      title,
      requirementKey: key,
    });
    expect(made.status).toBe(201);
  });

  it('the checklist: a site photo nobody checked is not "to check"; a free ID ask covers the ID row', async () => {
    const sale = await sellProject(admin, { name: 'Checklist Rules (test)' });
    await rows(
      `INSERT INTO documents (project_id, customer_id, category, source, name, storage_key, content_type, size_bytes)
       VALUES ($1, $2, 'site_photo', 'upload', 'from-chat.jpg', 'k', 'image/jpeg', 1)`,
      [sale.project.id, sale.customer.customerId],
    );
    await ask(sale.project.id, 'Aadhaar card (test)', {
      requirementKey: 'free:customer_kyc:aadhaar',
    });
    const list = await admin.get<{ items: Item[] }>(
      `/projects/${sale.project.id}/document-checklist`,
    );
    const byKey = (key: string) => list.items.find((one) => one.key === key);
    expect(byKey('survey')?.check).toBe('checked');
    expect(byKey('kyc')).toMatchObject({ check: 'missing', requested: true });
  });

  it('ask again works from closed; the customer sees the reason only while it is open', async () => {
    const sale = await sellProject(admin, { name: 'From Closed (test)' });
    const { phone } = sale.customer;
    const asked = await ask(sale.project.id, 'Aadhaar card (test)');
    const app = await Session.code(phone, 'customer');
    await app.post(`/customer/document-requests/${asked.id}/file`, await fileForm('document', {}));
    const paper = (await actionOf(asked.id))?.document_id ?? '';
    await admin.post(`/documents/${paper}/check`, {});
    const mine = () => app.get<Mine[]>('/customer/document-requests');
    // A checked paper reads as sent in the customer's app.
    expect((await mine()).find((one) => one.id === asked.id)?.status).toBe('received');
    const reason = 'The name is cut off (test)';
    const again = await admin.raw('POST', `/document-requests/${asked.id}/reask`, { note: reason });
    expect(again.status).toBe(200);
    expect((await mine()).find((one) => one.id === asked.id)).toMatchObject({
      status: 'open',
      note: reason,
    });
    await app.post(`/customer/document-requests/${asked.id}/file`, await fileForm('document', {}));
    expect((await mine()).find((one) => one.id === asked.id)).toMatchObject({
      status: 'received',
      note: '',
    });
  });

  it('ask again after a staff upload keeps the team’s file', async () => {
    const sale = await sellProject(admin, { name: 'Staff File (test)' });
    const asked = await ask(sale.project.id, 'Aadhaar card (test)');
    const doc = await upload(admin, 'document', {
      projectId: sale.project.id,
      category: 'customer_kyc',
    });
    expect((await actionOf(asked.id))?.status).toBe('closed');
    const again = await admin.raw('POST', `/document-requests/${asked.id}/reask`, {
      note: 'Please send a clearer copy (test)',
    });
    expect(again.status).toBe(200);
    expect((await actionOf(asked.id))?.status).toBe('open');
    const [kept] = await rows<{ removed: boolean }>(
      'SELECT removed_at IS NOT NULL AS removed FROM documents WHERE id = $1',
      [doc.id],
    );
    expect(kept?.removed).toBe(false);
    const listed = await admin.get<{ id: string; documentByTeam: boolean | null }[]>(
      `/document-requests?projectId=${sale.project.id}`,
    );
    expect(listed.find((one) => one.id === asked.id)?.documentByTeam).toBeNull();
  });

  it('Looks good on a paper nobody asked for still tells the customer', async () => {
    const sale = await sellProject(admin, { name: 'Unasked Paper (test)' });
    const { phone, customerId } = sale.customer;
    await say(phone, 'hello');
    const doc = await upload(admin, 'document', { customerId, category: 'electricity_bill' });
    await rows('UPDATE documents SET checked_at = NULL, checked_by_user_id = NULL WHERE id = $1', [
      doc.id,
    ]);
    await admin.post(`/documents/${doc.id}/check`, {});
    expect((await lastReply(phone))?.body).toBe('Your *Electricity bill* is checked ✅');
    // In Marathi, by the kind, not the file name.
    await rows(`UPDATE customers SET preferred_language = 'mr-IN' WHERE id = $1`, [customerId]);
    const other = await upload(admin, 'document', { customerId, category: 'customer_kyc' });
    await rows('UPDATE documents SET checked_at = NULL WHERE id = $1', [other.id]);
    await admin.post(`/documents/${other.id}/check`, {});
    const marathi = await rows<{ title: string }>(
      `SELECT title FROM notifications WHERE customer_id = $1 AND kind = 'paper_checked' ORDER BY created_at DESC LIMIT 1`,
      [customerId],
    );
    expect(marathi[0]?.title).toContain('आधार / पॅन');
    const inbox = await rows(
      `SELECT 1 FROM notifications WHERE customer_id = $1 AND kind = 'paper_checked'`,
      [customerId],
    );
    expect(inbox).toHaveLength(2);
  });

  it('a lead’s WhatsApp paper answers the ask and is logged on the lead; a lead with a project is asked on the project', async () => {
    const customer = await newCustomer(admin, { name: 'Lead WhatsApp (test)' });
    const asked = await admin.post<{ id: string }>('/document-requests', {
      leadId: customer.leadId,
      category: 'electricity_bill',
      title: 'Light bill (test)',
    });
    await sendInbound(customer.phone, {
      media: { type: 'document', fileId: `lead-${customer.phone}`, filename: 'bill.pdf' },
    });
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:yes');
    expect((await actionOf(asked.id))?.status).toBe('received');
    const log = await rows(
      `SELECT 1 FROM lead_activities WHERE lead_id = $1 AND note LIKE '%sent Light bill (test)%'`,
      [customer.leadId],
    );
    expect(log).toHaveLength(1);

    await sellOn(admin, customer, customer.propertyId);
    const refused = await admin.raw('POST', '/document-requests', {
      leadId: customer.leadId,
      category: 'customer_kyc',
      title: 'Aadhaar card (test)',
    });
    expect(refused.status).toBe(409);
  });
});
