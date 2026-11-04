import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { anotherHome } from '../support/homes';
import { Session } from '../support/http';
import { choices, lastReply, replies, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { STAFF } from '../support/team';
import { sendInbound } from '../support/whatsapp';

// A file answers only a request of the home it is for; two open on that home ask "Which
// paper is this?". The customer hears what was saved and what that home still needs.

const requestOf = async (id: string) =>
  (
    await rows<{ status: string; document_id: string | null }>(
      'SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1',
      [id],
    )
  )[0];

const customerDocs = (customerId: string) =>
  rows<{ id: string; category: string; project_id: string | null; property_id: string | null }>(
    `SELECT id, category, project_id, property_id FROM documents
      WHERE customer_id = $1 ORDER BY created_at`,
    [customerId],
  );

/** The alerts the chat's person got for one inbound message. */
const alertsFor = (waMessageId: string) =>
  rows('SELECT id FROM notifications WHERE dedupe_key LIKE $1', [`wa_in:${waMessageId}:%`]);

/** The "Which paper?" lists the bot sent this number. */
const paperLists = async (phone: string) =>
  (await replies(phone)).filter((reply) => choices(reply).some((id) => id.startsWith('fpaper:')));

describe('Papers per home: which paper', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const ask = (projectId: string, category: string, title: string) =>
    admin.post<{ id: string }>('/document-requests', { projectId, category, title });

  it('person request not taken by a home paper', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Person Kept (test)' });
    const farm = await anotherHome(admin, customer, 'Farm (test)');
    // The ID request is older, but only the farm waits on a paper of its own.
    const id = await ask(project.id, 'customer_kyc', 'Aadhaar card (test)');
    const deed = await ask(farm.projectId, 'property', 'Farm 7/12 extract (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'kept-1' } });
    const [doc] = await customerDocs(customer.customerId);
    expect(await requestOf(id.id)).toEqual({ status: 'open', document_id: null });
    expect(await requestOf(deed.id)).toEqual({ status: 'received', document_id: doc?.id });
    expect(doc).toMatchObject({ project_id: farm.projectId, property_id: farm.propertyId });
    const reply = (await lastReply(customer.phone))?.body ?? '';
    expect(reply).toContain('Farm 7/12 extract (test)');
    expect(reply).toContain('Farm (test)');
    expect(reply).not.toContain('Aadhaar');
  });

  it('two open papers ask which paper', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Which Paper (test)' });
    const bill = await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
    const deed = await ask(project.id, 'property', 'Sale deed (test)');
    const id = `wamid.acceptance-which-${customer.phone.slice(1)}`;
    await sendInbound(customer.phone, { id, media: { type: 'image', fileId: 'which-1' } });
    const [list] = await paperLists(customer.phone);
    expect(list?.body).toBe('Which paper is this?');
    // The file waiting on the answer reaches the chat's person once.
    expect(await alertsFor(id)).toHaveLength(1);
    expect(choices(list)).toEqual([`fpaper:${bill.id}`, `fpaper:${deed.id}`, 'fpaper:none']);
    expect((await requestOf(bill.id))?.status).toBe('open');
    expect((await requestOf(deed.id))?.status).toBe('open');
    await tap(customer.phone, `fpaper:${deed.id}`);
    const [doc] = await customerDocs(customer.customerId);
    expect(await requestOf(deed.id)).toEqual({ status: 'received', document_id: doc?.id });
    expect(doc).toMatchObject({ category: 'property', project_id: project.id });
    expect((await requestOf(bill.id))?.status).toBe('open');
    const reply = (await lastReply(customer.phone))?.body ?? '';
    expect(reply).toContain('Sale deed (test)');
    expect(reply).toContain('Still needed for this home: Electricity bill (test)');
  });

  it('a stale paper tap answers nothing', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Stale Paper (test)' });
    const bill = await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
    const deed = await ask(project.id, 'property', 'Sale deed (test)');
    const tax = await ask(project.id, 'other', 'Tax receipt (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'stale-paper-1' } });
    await rows("UPDATE customer_actions SET status = 'cancelled' WHERE id = $1", [deed.id]);
    await tap(customer.phone, `fpaper:${deed.id}`);
    expect((await requestOf(deed.id))?.status).toBe('cancelled');
    const lists = await paperLists(customer.phone);
    expect(lists).toHaveLength(2);
    expect(choices(lists[1])).toEqual([`fpaper:${bill.id}`, `fpaper:${tax.id}`, 'fpaper:none']);
    // A tap on another customer's request answers nothing either.
    const other = await sellProject(admin, { name: 'Other Paper (test)' });
    const theirs = await ask(other.project.id, 'electricity_bill', 'Their bill (test)');
    await tap(customer.phone, `fpaper:${theirs.id}`);
    expect((await requestOf(theirs.id))?.status).toBe('open');
    expect((await requestOf(bill.id))?.status).toBe('open');
    const [doc] = await customerDocs(customer.customerId);
    expect(doc).toMatchObject({ category: 'other', project_id: project.id });
  });

  it('front and back go together', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Front Back (test)' });
    const kyc = await ask(project.id, 'customer_kyc', 'Aadhaar card (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'front-1' } });
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'back-1' } });
    const docs = await customerDocs(customer.customerId);
    expect(docs.map((doc) => doc.category)).toEqual(['customer_kyc', 'customer_kyc']);
    expect(await requestOf(kyc.id)).toEqual({ status: 'received', document_id: docs[0]?.id });
    expect(await paperLists(customer.phone)).toEqual([]);
    // One reply for the pair: the back is filed quietly with the front.
    const saved = (await replies(customer.phone)).filter((each) => each.body?.includes('Saved'));
    expect(saved).toHaveLength(1);
  });

  it('a late paper tap uses the stored file', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Late Paper (test)' });
    await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
    const deed = await ask(project.id, 'property', 'Sale deed (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'late-1' } });
    // The customer opens the menu, and answers the list an hour later.
    await tap(customer.phone, 'menu');
    await rows(
      `UPDATE wa_conversations
          SET context = jsonb_set(context, '{paperWait,at}', '0'::jsonb) WHERE phone = $1`,
      [customer.phone],
    );
    await tap(customer.phone, `fpaper:${deed.id}`);
    const [doc] = await customerDocs(customer.customerId);
    expect(await requestOf(deed.id)).toEqual({ status: 'received', document_id: doc?.id });
    const reply = (await lastReply(customer.phone))?.body ?? '';
    expect(reply).toContain('Sale deed (test)');
    expect(reply).not.toContain('send it again');
  });

  it('one home still names its ID paper after its own paper', async () => {
    const { customer, project } = await sellProject(admin, { name: 'One Home Left (test)' });
    await ask(project.id, 'customer_kyc', 'Aadhaar card (test)');
    const bill = await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'one-left-1' } });
    expect((await requestOf(bill.id))?.status).toBe('received');
    expect((await lastReply(customer.phone))?.body).toContain(
      'Still needed for this home: Aadhaar card (test)',
    );
  });

  it('waiting task owner is told', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Task Waits (test)' });
    const [owner] = await rows<{ id: string }>('SELECT id FROM users WHERE phone_e164 = $1', [
      STAFF.execution.phone,
    ]);
    await rows(
      `UPDATE project_tasks SET status = 'waiting', waiting_party = 'customer',
              waiting_since = now(), assignee_user_id = $2
        WHERE id = (SELECT id FROM project_tasks WHERE project_id = $1 ORDER BY position LIMIT 1)`,
      [project.id, owner?.id],
    );
    await ask(project.id, 'electricity_bill', 'Electricity bill (test)');
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'task-waits-1' } });
    const told = await rows<{ title: string; subject_type: string; subject_id: string }>(
      'SELECT title, subject_type, subject_id FROM notifications WHERE user_id = $1 AND title LIKE $2',
      [owner?.id, '%sent Electricity bill (test)'],
    );
    expect(told).toEqual([
      {
        title: 'Task Waits (test) sent Electricity bill (test)',
        subject_type: 'project',
        subject_id: project.id,
      },
    ]);
  });

  it('a stray file is saved on the home without the problem question', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Stray File (test)' });
    const id = `wamid.acceptance-stray-${customer.phone.slice(1)}`;
    await sendInbound(customer.phone, { id, media: { type: 'image', fileId: 'stray-1' } });
    // The chat's person hears once, as before.
    expect(await alertsFor(id)).toHaveLength(1);
    const reply = await lastReply(customer.phone);
    expect(reply?.body).toContain('Saved: *photo* for your home at');
    expect(
      (await replies(customer.phone)).flatMap((each) => choices(each)).includes('service'),
    ).toBe(false);
    const [doc] = await customerDocs(customer.customerId);
    expect(doc).toMatchObject({
      category: 'other',
      project_id: project.id,
      property_id: customer.propertyId,
    });
  });
});
