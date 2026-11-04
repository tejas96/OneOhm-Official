import type { DocumentChecklist } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { fileForm, upload } from '../support/files';
import { anotherHome, sellOn } from '../support/homes';
import { Session } from '../support/http';
import { newCustomer, sellProject } from '../support/sales';

// Staff move a paper to another home or kind (papers per home, flow 4). Nothing is said
// to the customer unless the move reopens a request; then it is "ask again".

const requestOf = async (id: string) =>
  (
    await rows<{ status: string; document_id: string | null; note: string }>(
      'SELECT status::text AS status, document_id, note FROM document_requests WHERE id = $1',
      [id],
    )
  )[0];

const paperOf = async (id: string) =>
  (
    await rows<{
      project_id: string | null;
      property_id: string | null;
      category: string;
      removed: boolean;
    }>(
      `SELECT project_id, property_id, category, removed_at IS NOT NULL AS removed
         FROM documents WHERE id = $1`,
      [id],
    )
  )[0];

const logOf = async (projectId: string) =>
  (
    await rows<{ message: string }>(
      `SELECT message FROM project_activities WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    )
  ).map((row) => row.message);

describe('Papers per home: move / change kind', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const move = (
    id: string,
    body: { projectId: string | null; propertyId?: string | null; category: string },
  ) =>
    admin.raw<{ id: string; projectId: string | null; propertyId: string | null }>(
      'PATCH',
      `/documents/${id}`,
      body,
    );

  it('move reopens request', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Move Reopens (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: project.id,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
    });
    const app = await Session.code(customer.phone, 'customer');
    await app.post(
      `/customer/document-requests/${asked.id}/file`,
      await fileForm('document', { name: 'My bill (test)' }),
    );
    const paperId = (await requestOf(asked.id))?.document_id ?? '';
    const moved = await move(paperId, { projectId: farm.projectId, category: 'electricity_bill' });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ projectId: farm.projectId, propertyId: farm.propertyId });
    // The paper is moved, not wrong: it stays on file on the farm.
    expect(await paperOf(paperId)).toMatchObject({
      project_id: farm.projectId,
      property_id: farm.propertyId,
      removed: false,
    });
    expect(await requestOf(asked.id)).toEqual({
      status: 'open',
      document_id: null,
      note: 'Filed on another home',
    });
    const asks = await rows('SELECT 1 FROM outbox WHERE dedupe_key = $1', [
      `document_requested:${asked.id}:reask:1`,
    ]);
    expect(asks).toHaveLength(1);
    const farmCode = (await admin.get<{ code: string }>(`/projects/${farm.projectId}`)).code;
    const line = `Paper moved: ${(await paperName(paperId)) ?? ''} → ${farmCode}`;
    expect(await logOf(project.id)).toContain(line);
    expect(await logOf(farm.projectId)).toContain(line);
    const audit = await rows(
      `SELECT 1 FROM audit_log WHERE action = 'document.moved' AND entity_id = $1`,
      [paperId],
    );
    expect(audit).toHaveLength(1);
  });

  it('move to another customer is refused', async () => {
    const mine = await sellProject(admin, { name: 'Move Mine (test)' });
    const theirs = await sellProject(admin, { name: 'Move Theirs (test)' });
    const doc = await upload(admin, 'document', {
      projectId: mine.project.id,
      category: 'electricity_bill',
    });
    const refused = await move(doc.id, {
      projectId: theirs.project.id,
      category: 'electricity_bill',
    });
    expect(refused.status).toBe(409);
    expect((await paperOf(doc.id))?.project_id).toBe(mine.project.id);
  });

  it('checklist follows the move', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Move Checklist (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    const bill = async (projectId: string) =>
      (await admin.get<DocumentChecklist>(`/projects/${projectId}/document-checklist`)).items.find(
        (entry) => entry.key === 'bill',
      )?.status;
    const doc = await upload(admin, 'document', {
      projectId: project.id,
      category: 'electricity_bill',
    });
    expect(await bill(project.id)).toBe('present');
    expect(await bill(farm.projectId)).toBe('missing');
    expect(
      (await move(doc.id, { projectId: farm.projectId, category: 'electricity_bill' })).status,
    ).toBe(200);
    expect(await bill(project.id)).toBe('missing');
    expect(await bill(farm.projectId)).toBe('present');
  });

  it('an ID paper may have no home; a home paper may not', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Move No Home (test)' });
    await anotherHome(admin, customer, 'Farm (test)');
    const doc = await upload(admin, 'photo', { projectId: project.id, category: 'other' });
    const homeless = await move(doc.id, { projectId: null, category: 'electricity_bill' });
    expect(homeless.status).toBe(400);
    // Only kinds the customer sees: a vendor's paper would hide it from their app.
    const internal = await move(doc.id, { projectId: project.id, category: 'vendor' });
    expect(internal.status).toBe(400);
    const person = await move(doc.id, { projectId: null, category: 'customer_kyc' });
    expect(person.status).toBe(200);
    expect(await paperOf(doc.id)).toMatchObject({
      project_id: null,
      property_id: null,
      category: 'customer_kyc',
    });
  });

  it('a move onto an asked-for paper closes that request', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Move Closes (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    const farmBill = await admin.post<{ id: string }>('/document-requests', {
      projectId: farm.projectId,
      category: 'electricity_bill',
      title: 'Farm bill (test)',
    });
    const doc = await upload(admin, 'document', { projectId: project.id, category: 'other' });
    await move(doc.id, { projectId: farm.projectId, category: 'electricity_bill' });
    expect(await requestOf(farmBill.id)).toMatchObject({ status: 'received', document_id: doc.id });
  });

  it('a paper moves to a lead-only home, changes kind there, and joins its project', async () => {
    const customer = await newCustomer(admin, { name: 'Move Lead Home (test)' });
    const stranger = await newCustomer(admin, { name: 'Move Stranger (test)' });
    const doc = await upload(admin, 'document', {
      customerId: customer.customerId,
      category: 'customer_kyc',
    });
    const home = { projectId: null, propertyId: customer.propertyId };
    expect((await move(doc.id, { ...home, category: 'electricity_bill' })).status).toBe(200);
    expect(await paperOf(doc.id)).toMatchObject({
      project_id: null,
      property_id: customer.propertyId,
      category: 'electricity_bill',
    });
    const leadLog = await rows<{ note: string }>(
      'SELECT note FROM lead_activities WHERE lead_id = $1',
      [customer.leadId],
    );
    expect(leadLog.map((row) => row.note)).toContainEqual(expect.stringMatching(/^Paper moved: /));
    // A kind-only change keeps it on the same lead-only home.
    expect((await move(doc.id, { ...home, category: 'other' })).status).toBe(200);
    expect(await paperOf(doc.id)).toMatchObject({
      property_id: customer.propertyId,
      category: 'other',
    });
    const elsewhere = { projectId: null, propertyId: stranger.propertyId, category: 'other' };
    expect((await move(doc.id, elsewhere)).status).toBe(409);
    // The home's project is made: the paper filed there goes onto it.
    const project = await sellOn(admin, customer, customer.propertyId);
    expect((await paperOf(doc.id))?.project_id).toBe(project.id);
  });

  it('the sheet lists one row per home', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Move Homes (test)' });
    const second = await sellOn(admin, customer, customer.propertyId);
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    const doc = await upload(admin, 'document', { projectId: project.id, category: 'other' });
    const homes = await admin.get<{ projectId: string | null; propertyId: string }[]>(
      `/documents/${doc.id}/homes`,
    );
    expect(homes.map((home) => home.propertyId).sort()).toEqual(
      [customer.propertyId, farm.propertyId].sort(),
    );
    expect(homes.find((home) => home.propertyId === customer.propertyId)?.projectId).toBe(
      second.id,
    );
  });
});

async function paperName(id: string) {
  const [row] = await rows<{ name: string }>('SELECT name FROM documents WHERE id = $1', [id]);
  return row?.name;
}
