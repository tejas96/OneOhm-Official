import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { chatOf, choices, lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// "Which home is this for?": a customer with two or more homes is asked once per burst of
// files; until they answer, the files wait under the customer as "To sort".

interface ChatMessageRow {
  readonly direction: string;
  readonly file: { id: string } | null;
}

async function chatFileIds(admin: Session, phone: string) {
  const chat = await chatOf(phone);
  const detail = await admin.get<{ messages: ChatMessageRow[] }>(`/whatsapp/chats/${chat.id}`);
  return detail.messages
    .filter((row) => row.direction === 'in' && row.file)
    .map((row) => row.file?.id);
}

const customerDocs = (customerId: string) =>
  rows<{ id: string; project_id: string | null; property_id: string | null }>(
    'SELECT id, project_id, property_id FROM documents WHERE customer_id = $1 ORDER BY created_at',
    [customerId],
  );

/** The "Which home?" lists the bot sent this number. */
const homeLists = async (phone: string) =>
  (await replies(phone)).filter((reply) => choices(reply).some((id) => id.startsWith('fhome:')));

describe('Papers per home: which home', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('one question for a burst', async () => {
    const { customer } = await sellProject(admin, { name: 'Burst Files (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    for (const n of [1, 2, 3, 4])
      await sendInbound(customer.phone, { media: { type: 'image', fileId: `burst-${n}` } });
    const lists = await homeLists(customer.phone);
    expect(lists).toHaveLength(1);
    expect(lists[0]?.body).toBe('Which home is this for?');
    expect(choices(lists[0])).toEqual([
      `fhome:${farm.propertyId}`,
      `fhome:${customer.propertyId}`,
      'fhome:person',
    ]);
    expect((await customerDocs(customer.customerId)).map((doc) => doc.project_id)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    await tap(customer.phone, `fhome:${farm.propertyId}`);
    const docs = await rows<{ project_id: string; property_id: string }>(
      'SELECT project_id, property_id FROM documents WHERE customer_id = $1',
      [customer.customerId],
    );
    expect(docs).toHaveLength(4);
    for (const doc of docs)
      expect(doc).toEqual({ project_id: farm.projectId, property_id: farm.propertyId });
    expect((await lastReply(customer.phone))?.body).toContain('Farm (test)');
    expect(await homeLists(customer.phone)).toHaveLength(1);
  });

  it('one home is never asked', async () => {
    const { customer, project } = await sellProject(admin, { name: 'One Home (test)' });
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'one-home-1' } });
    expect(await homeLists(customer.phone)).toEqual([]);
    const docs = await customerDocs(customer.customerId);
    expect(docs.map(({ project_id, property_id }) => ({ project_id, property_id }))).toEqual([
      { project_id: project.id, property_id: customer.propertyId },
    ]);
  });

  it('stale home tap', async () => {
    const { customer } = await sellProject(admin, { name: 'Stale Home (test)' });
    await anotherHome(admin, customer, 'Farm (test)');
    const shed = await anotherHome(admin, customer, 'Shed (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'stale-home-1' } });
    expect(await homeLists(customer.phone)).toHaveLength(1);
    await rows("UPDATE projects SET status = 'cancelled' WHERE id = $1", [shed.projectId]);
    await tap(customer.phone, `fhome:${shed.propertyId}`);
    const lists = await homeLists(customer.phone);
    expect(lists).toHaveLength(2);
    expect(choices(lists[1])).not.toContain(`fhome:${shed.propertyId}`);
    const docs = await rows<{ project_id: string | null; property_id: string | null }>(
      'SELECT project_id, property_id FROM documents WHERE customer_id = $1',
      [customer.customerId],
    );
    expect(docs).toEqual([{ project_id: null, property_id: null }]);
  });

  it('unanswered files stay to sort and show in the chat', async () => {
    const { customer } = await sellProject(admin, { name: 'To Sort (test)' });
    await anotherHome(admin, customer, 'Farm (test)');
    const id = `wamid.acceptance-to-sort-${customer.phone.slice(1)}`;
    await sendInbound(customer.phone, { id, media: { type: 'image', fileId: 'to-sort-1' } });
    const docs = await customerDocs(customer.customerId);
    expect(docs.map((doc) => doc.project_id)).toEqual([null]);
    expect(await chatFileIds(admin, customer.phone)).toEqual([docs[0]?.id]);
    const chat = await rows<{ to_sort: { id: string }[] }>(
      `SELECT context->'toSort' AS to_sort FROM wa_conversations WHERE phone = $1`,
      [customer.phone],
    );
    expect(chat[0]?.to_sort.map((entry) => entry.id)).toEqual([docs[0]?.id]);
    // The chat's person hears of it once.
    const alerts = await rows(`SELECT id FROM notifications WHERE dedupe_key LIKE $1`, [
      `wa_in:${id}:%`,
    ]);
    expect(alerts).toHaveLength(1);
  });

  it('a burst sent all at once is asked once and filed whole', async () => {
    const { customer } = await sellProject(admin, { name: 'Parallel Burst (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        sendInbound(customer.phone, { media: { type: 'image', fileId: `parallel-${n}` } }),
      ),
    );
    expect(await homeLists(customer.phone)).toHaveLength(1);
    await tap(customer.phone, `fhome:${farm.propertyId}`);
    const docs = await customerDocs(customer.customerId);
    expect(docs.map(({ project_id, property_id }) => ({ project_id, property_id }))).toEqual(
      Array(4).fill({ project_id: farm.projectId, property_id: farm.propertyId }),
    );
    expect((await lastReply(customer.phone))?.body).toContain('(4)');
  });

  it('a voice note waits with the photos and never takes a paper request', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Voice Waits (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    // Both homes wait on a paper, so the customer is asked; the site's request is older.
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: project.id,
      category: 'electricity_bill',
      title: 'Electricity bill (test)',
    });
    await admin.post('/document-requests', {
      projectId: farm.projectId,
      category: 'property',
      title: 'Farm 7/12 extract (test)',
    });
    await sendInbound(customer.phone, { media: { type: 'audio', fileId: 'waits-voice' } });
    // A voice note alone does not ask.
    expect(await homeLists(customer.phone)).toEqual([]);
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'waits-photo' } });
    expect(await homeLists(customer.phone)).toHaveLength(1);
    await tap(customer.phone, `fhome:${customer.propertyId}`);
    const [voice, photo] = await customerDocs(customer.customerId);
    expect(voice).toMatchObject({ project_id: project.id, property_id: customer.propertyId });
    const [request] = await rows<{ status: string; document_id: string }>(
      'SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1',
      [asked.id],
    );
    expect(request).toEqual({ status: 'received', document_id: photo?.id });
    const reply = (await lastReply(customer.phone))?.body ?? '';
    expect(reply).toContain('Electricity bill (test)');
    expect(reply).not.toContain('Sorry');
  });

  it('the person row files photos as ID papers and keeps a voice note as it is', async () => {
    const { customer } = await sellProject(admin, { name: 'Person Voice (test)' });
    await anotherHome(admin, customer, 'Farm (test)');
    await sendInbound(customer.phone, { media: { type: 'audio', fileId: 'person-voice' } });
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'person-photo' } });
    await tap(customer.phone, 'fhome:person');
    const kinds = await rows<{ category: string; property_id: string | null }>(
      'SELECT category, property_id FROM documents WHERE customer_id = $1 ORDER BY created_at',
      [customer.customerId],
    );
    expect(kinds).toEqual([
      { category: 'other', property_id: null },
      { category: 'customer_kyc', property_id: null },
    ]);
    // The reply names the photo only, not the voice note.
    expect((await lastReply(customer.phone))?.body).not.toContain('(2)');
  });

  it('the home chosen survives a Menu tap', async () => {
    const { customer } = await sellProject(admin, { name: 'Menu Keeps (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'menu-keeps-1' } });
    await tap(customer.phone, `fhome:${farm.propertyId}`);
    await tap(customer.phone, 'menu');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'menu-keeps-2' } });
    expect(await homeLists(customer.phone)).toHaveLength(1);
    const docs = await customerDocs(customer.customerId);
    expect(docs.map(({ project_id, property_id }) => ({ project_id, property_id }))).toEqual(
      Array(2).fill({ project_id: farm.projectId, property_id: farm.propertyId }),
    );
  });

  it('a tap with nothing to sort does not claim a save', async () => {
    const { customer } = await sellProject(admin, { name: 'Nothing To Sort (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'nothing-1' } });
    await tap(customer.phone, `fhome:${farm.propertyId}`);
    await tap(customer.phone, `fhome:${farm.propertyId}`);
    expect((await lastReply(customer.phone))?.body).not.toContain('Saved');
    const docs = await customerDocs(customer.customerId);
    expect(docs).toHaveLength(1);
  });

  it('the person row files the waiting papers as ID papers, on no home', async () => {
    const { customer } = await sellProject(admin, { name: 'Person Row (test)' });
    await anotherHome(admin, customer, 'Farm (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'person-row-1' } });
    await tap(customer.phone, 'fhome:person');
    const docs = await rows<{ category: string; project_id: string | null }>(
      'SELECT category, project_id FROM documents WHERE customer_id = $1',
      [customer.customerId],
    );
    expect(docs).toEqual([{ category: 'customer_kyc', project_id: null }]);
  });
});
