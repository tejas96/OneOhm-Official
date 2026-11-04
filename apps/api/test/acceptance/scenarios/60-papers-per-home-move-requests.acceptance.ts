import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { fileForm } from '../support/files';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { sellProject } from '../support/sales';

// A move keeps requests honest: a request the paper no longer answers is asked again,
// or closed quietly when a newer request for that paper is already open.

const requestOf = async (id: string) =>
  (
    await rows<{ status: string; document_id: string | null; note: string }>(
      'SELECT status::text AS status, document_id, reason AS note FROM customer_actions WHERE id = $1',
      [id],
    )
  )[0];

describe('Papers per home: moves and requests', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const ask = (projectId: string, title: string) =>
    admin.post<{ id: string }>('/document-requests', {
      projectId,
      category: 'electricity_bill',
      title,
    });

  /** The customer answers the request in the app; returns the paper. */
  const answer = async (phone: string, requestId: string) => {
    const app = await Session.code(phone, 'customer');
    await app.post(`/customer/document-requests/${requestId}/file`, await fileForm('document', {}));
    return (await requestOf(requestId))?.document_id ?? '';
  };

  it('a kind change on the same home asks again', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Move Kind (test)' });
    const asked = await ask(project.id, 'Electricity bill (test)');
    const paperId = await answer(customer.phone, asked.id);
    const moved = await admin.raw('PATCH', `/documents/${paperId}`, {
      projectId: project.id,
      category: 'property',
    });
    expect(moved.status).toBe(200);
    expect(await requestOf(asked.id)).toEqual({
      status: 'open',
      document_id: null,
      note: 'Filed on another home',
    });
    const [paper] = await rows<{ category: string; removed: boolean }>(
      'SELECT category, removed_at IS NOT NULL AS removed FROM documents WHERE id = $1',
      [paperId],
    );
    expect(paper).toEqual({ category: 'property', removed: false });
    const asks = await rows('SELECT 1 FROM outbox WHERE dedupe_key = $1', [
      `document_requested:${asked.id}:reask:1`,
    ]);
    expect(asks).toHaveLength(1);
  });

  it('a superseded request closes quietly', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Move Superseded (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    const first = await ask(project.id, 'Electricity bill (test)');
    const paperId = await answer(customer.phone, first.id);
    const newer = await ask(project.id, 'Latest electricity bill (test)');
    const moved = await admin.raw('PATCH', `/documents/${paperId}`, {
      projectId: farm.projectId,
      category: 'electricity_bill',
    });
    expect(moved.status).toBe(200);
    expect(await requestOf(first.id)).toMatchObject({ status: 'cancelled', document_id: null });
    expect((await requestOf(newer.id))?.status).toBe('open');
    const log = await rows<{ message: string }>(
      'SELECT message FROM project_activities WHERE project_id = $1',
      [project.id],
    );
    expect(log.map((row) => row.message)).toContain(
      'Request for Electricity bill (test) closed: paper filed on another home; newer request open',
    );
    const audit = await rows(
      `SELECT 1 FROM audit_log WHERE action = 'customer_action.superseded' AND entity_id = $1`,
      [first.id],
    );
    expect(audit).toHaveLength(1);
    // Nothing is said to the customer: they are already asked for the newer one.
    const said = await rows(
      `SELECT 1 FROM outbox WHERE dedupe_key LIKE $1
        UNION ALL SELECT 1 FROM notifications WHERE dedupe_key LIKE $1`,
      [`%${first.id}:reask%`],
    );
    const cancelled = await rows(
      `SELECT 1 FROM notifications WHERE customer_id = $1 AND kind = 'document_request_cancelled'`,
      [customer.customerId],
    );
    expect([...said, ...cancelled]).toEqual([]);
  });
});
