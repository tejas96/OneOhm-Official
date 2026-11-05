import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { chatOf, replies, say, tap } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { askAboutFiles } from '../support/what-is-this';
import { sendInbound } from '../support/whatsapp';

// Every file a customer sends on WhatsApp shows in the chat and is kept under Documents,
// once: on the request it answers, the problem it shows, or (else) the customer's project.
// The project log says so and the chat's person hears once.

interface ChatMessageRow {
  readonly direction: string;
  readonly file: { id: string; name: string; contentType: string } | null;
}

async function chatFiles(admin: Session, phone: string) {
  const chat = await chatOf(phone);
  const detail = await admin.get<{ messages: ChatMessageRow[] }>(`/whatsapp/chats/${chat.id}`);
  return detail.messages.filter((message) => message.direction === 'in' && message.file);
}

const projectDocs = (projectId: string) =>
  rows<{ id: string; category: string; removed: boolean; request: string | null }>(
    `SELECT id, category, removed_at IS NOT NULL AS removed, service_request_id AS request
       FROM documents WHERE project_id = $1 ORDER BY created_at`,
    [projectId],
  );

const projectLog = (projectId: string) =>
  rows<{ kind: string; message: string }>(
    `SELECT kind, message FROM project_activities WHERE project_id = $1 ORDER BY created_at`,
    [projectId],
  );

describe('WhatsApp chat files', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('a voice note is kept on the project, shown in the chat and written in the log', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Voice Note (test)' });
    await sendInbound(customer.phone, { media: { type: 'audio', fileId: 'voice-1' } });
    const shown = await chatFiles(admin, customer.phone);
    expect(shown).toHaveLength(1);
    const docs = await projectDocs(project.id);
    expect(docs.filter((doc) => doc.category === 'other').map((doc) => doc.id)).toEqual([
      shown[0]?.file?.id,
    ]);
    expect((await projectLog(project.id)).map((line) => line.kind)).toContain('whatsapp_file');
  });

  it('a photo sent while a person has the chat is kept, with one alert', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Held Photo (test)' });
    await say(customer.phone, 'hello');
    const chat = await chatOf(customer.phone);
    await admin.post(`/whatsapp/chats/${chat.id}/reply`, { text: 'Hello from the office (test)' });
    const id = `wamid.acceptance-held-${customer.phone.slice(1)}`;
    await sendInbound(customer.phone, { id, media: { type: 'image', fileId: 'held-1' } });
    expect(await chatFiles(admin, customer.phone)).toHaveLength(1);
    const alerts = await rows(`SELECT id FROM notifications WHERE dedupe_key LIKE $1`, [
      `wa_in:${id}:%`,
    ]);
    expect(alerts).toHaveLength(1);
    // The question still goes out in a held chat; "Something else" keeps it on the home.
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:other');
    expect((await projectDocs(project.id)).some((doc) => doc.category === 'other')).toBe(true);
  });

  it('a paper sent while a person has the chat answers the open request, filed once', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Held Paper (test)' });
    await say(customer.phone, 'hello');
    const chat = await chatOf(customer.phone);
    await admin.post(`/whatsapp/chats/${chat.id}/reply`, { text: 'Hello from the office (test)' });
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: project.id,
      category: 'customer_kyc',
      title: 'Aadhaar card (test)',
    });
    await sendInbound(customer.phone, {
      media: { type: 'document', fileId: 'held-paper', filename: 'aadhaar.pdf' },
    });
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:yes');
    const [request] = await rows<{ status: string; document_id: string }>(
      `SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1`,
      [asked.id],
    );
    expect(request?.status).toBe('received');
    // An ID paper names no home.
    expect((await replies(customer.phone)).at(-1)?.body).toBe(
      "Saved ✅ *Aadhaar / PAN*. We'll check it.",
    );
    const shown = await chatFiles(admin, customer.phone);
    expect(shown.map((message) => message.file?.id)).toEqual([request?.document_id]);
    expect((await projectDocs(project.id)).filter((doc) => doc.category === 'other')).toEqual([]);
    const kinds = (await projectLog(project.id)).map((line) => line.kind);
    expect(kinds).toEqual(expect.arrayContaining(['document_request', 'document_received']));
  });

  it('a photo kept before the problem was told moves onto the problem, stored once', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Problem Photo (test)' });
    await sendInbound(customer.phone, { media: { type: 'image', fileId: 'problem-1' } });
    await askAboutFiles(admin);
    await tap(customer.phone, 'what:prob');
    const [kept] = await rows<{ id: string }>('SELECT id FROM documents WHERE customer_id = $1', [
      customer.customerId,
    ]);
    await tap(customer.phone, 'pb:what:inverter');
    await tap(customer.phone, 'pb:since:today');
    await say(customer.phone, 'The inverter shows a red light (test)');
    // The same document now shows the problem: no second copy, nothing removed.
    const docs = await projectDocs(project.id);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: kept?.id, removed: false });
    expect(docs[0]?.request).not.toBeNull();
    const shown = await chatFiles(admin, customer.phone);
    expect(shown.map((message) => message.file?.id)).toEqual([kept?.id]);
  });
});
