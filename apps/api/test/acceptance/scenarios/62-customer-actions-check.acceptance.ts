import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { fileForm, upload } from '../support/files';
import { Session } from '../support/http';
import { choices, lastReply, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Customer actions (redesign §5.3): a paper the customer sends waits for the team's check.
// "Looks good" closes it and tells the customer; "Ask again" opens it with the reason; the
// checklist shows missing, to check and checked; the team's own uploads are checked at once.

interface Item {
  key: string;
  check: string | null;
  actionId: string | null;
  requested: boolean;
  documentIds: string[];
}

const docOf = async (id: string) =>
  (
    await rows<{ checked: boolean; by: string | null }>(
      'SELECT checked_at IS NOT NULL AS checked, checked_by_user_id AS by FROM documents WHERE id = $1',
      [id],
    )
  )[0];

const actionOf = async (id: string) =>
  (
    await rows<{ status: string; reason: string; document_id: string | null; closed: boolean }>(
      `SELECT status::text AS status, reason, document_id, closed_at IS NOT NULL AS closed
         FROM customer_actions WHERE id = $1`,
      [id],
    )
  )[0];

describe('Customer actions: the paper check', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  /** A sold customer asked for their ID, who sends it on WhatsApp (their chat window is open). */
  async function sentOnWhatsApp(name: string) {
    const sale = await sellProject(admin, { name });
    const { phone } = sale.customer;
    await say(phone, 'hello');
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'customer_kyc',
      title: 'Aadhaar card (test)',
      requirementKey: 'kyc',
    });
    await sendInbound(phone, {
      media: { type: 'document', fileId: `kyc-${phone}`, filename: 'aadhaar.pdf' },
    });
    const action = await actionOf(asked.id);
    return { ...sale, askedId: asked.id, documentId: action?.document_id ?? '' };
  }

  it('a paper from WhatsApp is received and unchecked; Looks good closes it and tells the customer', async () => {
    const { customer, askedId, documentId } = await sentOnWhatsApp('Looks Good (test)');
    expect(await actionOf(askedId)).toMatchObject({ status: 'received', closed: false });
    expect(await docOf(documentId)).toEqual({ checked: false, by: null });

    const checked = await admin.raw('POST', `/documents/${documentId}/check`, {});
    expect(checked.status).toBe(200);
    expect(await actionOf(askedId)).toMatchObject({ status: 'closed', closed: true });
    expect(await docOf(documentId)).toEqual({ checked: true, by: admin.userId });
    // Told in the chat (the window is open) and in the app inbox, once.
    expect((await lastReply(customer.phone))?.body).toBe(
      'Your *Aadhaar card (test)* is checked ✅',
    );
    const inbox = await rows<{ title: string }>(
      `SELECT title FROM notifications WHERE customer_id = $1 AND kind = 'paper_checked'`,
      [customer.customerId],
    );
    expect(inbox).toEqual([{ title: 'Your Aadhaar card (test) is checked ✅' }]);
    // Checking again changes nothing and says nothing more.
    await admin.post(`/documents/${documentId}/check`, {});
    expect(
      await rows(`SELECT 1 FROM notifications WHERE customer_id = $1 AND kind = 'paper_checked'`, [
        customer.customerId,
      ]),
    ).toHaveLength(1);
    const audit = await rows(
      `SELECT 1 FROM audit_log WHERE action = 'customer_action.checked' AND entity_id = $1`,
      [askedId],
    );
    expect(audit).toHaveLength(1);
  });

  it('Ask again with a reason tells the customer the reason and offers Send it now', async () => {
    const { customer, askedId, documentId } = await sentOnWhatsApp('Ask Again Why (test)');
    const reason = 'The photo is blurred; please send a clear one';
    const reasked = await admin.raw('POST', `/document-requests/${askedId}/reask`, {
      note: reason,
    });
    expect(reasked.status).toBe(200);
    expect(await actionOf(askedId)).toMatchObject({ status: 'open', reason, document_id: null });
    expect((await docOf(documentId)) ?? { checked: false }).toBeTruthy();
    const said = await lastReply(customer.phone);
    expect(said?.body).toBe(`Please send your Aadhaar card (test) again: ${reason}.`);
    expect(choices(said)).toEqual([`sendit:${askedId}`]);
    expect(said?.buttons?.[0]?.title).toBe('Send it now');
    // The app shows the reason on the request, and in the inbox.
    const app = await Session.code(customer.phone, 'customer');
    const mine = await app.get<{ id: string; note: string; status: string }[]>(
      '/customer/document-requests',
    );
    expect(mine.find((one) => one.id === askedId)).toMatchObject({ note: reason, status: 'open' });
    const inbox = await rows<{ title: string; body: string }>(
      `SELECT title, body FROM notifications WHERE customer_id = $1 AND dedupe_key LIKE $2`,
      [customer.customerId, `notice:document_requested:${askedId}:reask%`],
    );
    expect(inbox).toEqual([{ title: 'Please send your Aadhaar card (test) again', body: reason }]);
    // [Send it now] asks for that paper by name.
    await tap(customer.phone, `sendit:${askedId}`);
    expect((await lastReply(customer.phone))?.body).toContain('Aadhaar card (test)');
  });

  it('the checklist shows missing, to check and checked', async () => {
    const sale = await sellProject(admin, { name: 'Checklist Check (test)' });
    const { phone } = sale.customer;
    await say(phone, 'hello');
    const itemOf = async () => {
      const list = await admin.get<{ items: Item[] }>(
        `/projects/${sale.project.id}/document-checklist`,
      );
      const kyc = list.items.find((one) => one.key === 'kyc');
      if (!kyc) throw new Error('No ID item on the checklist');
      return kyc;
    };
    expect(await itemOf()).toMatchObject({ check: 'missing', actionId: null, requested: false });
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'customer_kyc',
      title: 'Aadhaar card (test)',
      requirementKey: 'kyc',
    });
    expect(await itemOf()).toMatchObject({ check: 'missing', requested: true });
    await sendInbound(phone, {
      media: { type: 'document', fileId: `kyc-${phone}`, filename: 'a.pdf' },
    });
    const waiting = await itemOf();
    expect(waiting).toMatchObject({ check: 'to_check', actionId: asked.id });
    expect(waiting.documentIds).toHaveLength(1);
    await admin.post(`/documents/${waiting.documentIds[0]}/check`, {});
    expect(await itemOf()).toMatchObject({ check: 'checked', actionId: null });
  });

  it('a staff upload is checked at once; a paper in the app is not', async () => {
    const sale = await sellProject(admin, { name: 'Who Checks (test)' });
    const staff = await upload(admin, 'document', {
      projectId: sale.project.id,
      category: 'electricity_bill',
    });
    expect(await docOf(staff.id)).toEqual({ checked: true, by: admin.userId });

    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: sale.project.id,
      category: 'customer_kyc',
      title: 'Aadhaar card (test)',
    });
    const app = await Session.code(sale.customer.phone, 'customer');
    await app.post(`/customer/document-requests/${asked.id}/file`, await fileForm('document', {}));
    const received = await actionOf(asked.id);
    expect(received?.status).toBe('received');
    expect(await docOf(received?.document_id ?? '')).toEqual({ checked: false, by: null });
  });

  it('only people who can upload papers can check one', async () => {
    const { customer, documentId } = await sentOnWhatsApp('Who May Check (test)');
    const app = await Session.code(customer.phone, 'customer');
    const refused = await app.raw('POST', `/documents/${documentId}/check`, {});
    expect([401, 403]).toContain(refused.status);
    expect((await docOf(documentId))?.checked).toBe(false);
  });
});
