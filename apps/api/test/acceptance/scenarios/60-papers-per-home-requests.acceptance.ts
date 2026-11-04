import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { fileForm, upload } from '../support/files';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';

// Requests per home: each home is asked for its own bill, the customer hears when a
// request is cancelled or asked again, and a staff upload of the paper closes it.

const requestOf = async (id: string) =>
  (
    await rows<{ status: string; document_id: string | null; note: string }>(
      'SELECT status::text AS status, document_id, note FROM document_requests WHERE id = $1',
      [id],
    )
  )[0];

const customerAlerts = (customerId: string, kind: string) =>
  rows<{ title: string; body: string }>(
    'SELECT title, body FROM notifications WHERE customer_id = $1 AND kind = $2',
    [customerId, kind],
  );

const outboxFor = (dedupeKey: string) =>
  rows<{ template: string; payload: Record<string, string> }>(
    'SELECT template, payload FROM outbox WHERE dedupe_key IN ($1, $2)',
    [dedupeKey, `${dedupeKey}:sms`],
  );

describe('Papers per home: requests', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const ask = (projectId: string, category: string, title: string) =>
    admin.post<{ id: string; homeName: string | null }>('/document-requests', {
      projectId,
      category,
      title,
    });

  it('bill can be asked for each home', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Two Bills (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    const first = await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
    const second = await ask(farm.projectId, 'electricity_bill', 'Farm bill (test)');
    expect(second.homeName).toBe('Farm (test)');
    expect((await requestOf(first.id))?.status).toBe('open');
    expect((await requestOf(second.id))?.status).toBe('open');
    // The same home is not asked twice; an ID paper is asked once for all homes.
    const again = await admin.raw('POST', '/document-requests', {
      projectId: farm.projectId,
      category: 'electricity_bill',
      title: 'Farm bill again (test)',
    });
    expect(again.status).toBe(409);
    await ask(project.id, 'customer_kyc', 'Aadhaar card (test)');
    const kyc = await admin.raw('POST', '/document-requests', {
      projectId: farm.projectId,
      category: 'customer_kyc',
      title: 'Aadhaar card again (test)',
    });
    expect(kyc.status).toBe(409);
  });

  it('cancel tells the customer', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Cancel Told (test)' });
    const asked = await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
    await admin.post(`/document-requests/${asked.id}/cancel`, {});
    expect(await customerAlerts(customer.customerId, 'document_request_cancelled')).toEqual([
      {
        title: 'Electricity bill (test) is no longer needed',
        body: 'You do not need to send it.',
      },
    ]);
  });

  it('ask again reopens and messages', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Ask Again (test)' });
    const asked = await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
    const app = await Session.code(customer.phone, 'customer');
    const answer = async () =>
      app.post(`/customer/document-requests/${asked.id}/file`, await fileForm('document', {}));
    await answer();
    const old = (await requestOf(asked.id))?.document_id ?? '';
    const note = 'The photo is blurred; please send a clear one (test)';
    const reasked = await admin.post<{ status: string; documentId: string | null }>(
      `/document-requests/${asked.id}/reask`,
      { note },
    );
    expect(reasked).toMatchObject({ status: 'open', documentId: null });
    expect(await requestOf(asked.id)).toEqual({ status: 'open', document_id: null, note });
    const [paper] = await rows<{ removed: boolean }>(
      'SELECT removed_at IS NOT NULL AS removed FROM documents WHERE id = $1',
      [old],
    );
    expect(paper?.removed).toBe(true);
    expect(await outboxFor(`document_requested:${asked.id}:reask:1`)).toHaveLength(1);
    const mine = await app.get<{ id: string; note: string; status: string }[]>(
      '/customer/document-requests',
    );
    expect(mine.find((request) => request.id === asked.id)).toMatchObject({ note, status: 'open' });
    // The second answer reaches the asker too; it is not taken for the first.
    await answer();
    const told = await rows(
      'SELECT 1 FROM notifications WHERE user_id = $1 AND dedupe_key LIKE $2',
      [admin.userId, `document_received:${asked.id}%`],
    );
    expect(told).toHaveLength(2);
    const log = await rows<{ message: string }>(
      `SELECT message FROM project_activities WHERE project_id = $1 AND kind = 'document_request'
        ORDER BY created_at`,
      [project.id],
    );
    expect(log.map((row) => row.message)).toContain(
      'Asked the customer again for Electricity bill (test)',
    );
  });

  it('staff upload closes the open request', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Staff Upload (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    const bill = await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
    const farmBill = await ask(farm.projectId, 'electricity_bill', 'Farm bill (test)');
    const doc = await upload(admin, 'document', {
      projectId: project.id,
      category: 'electricity_bill',
      name: 'Bill given on site (test)',
    });
    expect(await requestOf(bill.id)).toMatchObject({ status: 'received', document_id: doc.id });
    expect((await requestOf(farmBill.id))?.status).toBe('open');
    const [told] = await customerAlerts(customer.customerId, 'document_received_by_team');
    expect(told?.title).toContain('Electricity bill (test)');
    const log = await rows(
      `SELECT 1 FROM project_activities WHERE project_id = $1 AND kind = 'document_received'`,
      [project.id],
    );
    expect(log).toHaveLength(1);
  });

  it('uses paper_request once it is active', async () => {
    const { project } = await sellProject(admin, { name: 'New Template (test)' });
    await rows("UPDATE message_templates SET active = true WHERE key = 'paper_request'");
    try {
      const asked = await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
      const [sent] = await outboxFor(`document_requested:${asked.id}`);
      expect(sent?.template).toBe('paper_request');
      expect(sent?.payload.home).toContain(asked.homeName ?? 'no home');
      expect(sent?.payload.document).toBe('Electricity bill (test)');
    } finally {
      await rows("UPDATE message_templates SET active = false WHERE key = 'paper_request'");
    }
  });
});
