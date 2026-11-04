import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { chatOf, lastReply, say } from '../support/onboarding';
import { sellProject } from '../support/sales';
import { sendInbound, sendStatus } from '../support/whatsapp';

// What used to go silent no longer does: a location pin, a contact card, a reply WhatsApp
// could not deliver, and a Word file. The chat shows each and the chat's person hears once.

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface ChatMessageRow {
  readonly direction: string;
  readonly body: string;
  readonly file: { id: string; name: string; contentType: string } | null;
}

async function chatMessages(admin: Session, phone: string) {
  const chat = await chatOf(phone);
  const detail = await admin.get<{ messages: ChatMessageRow[] }>(`/whatsapp/chats/${chat.id}`);
  return detail.messages.filter((message) => message.direction === 'in');
}

const alertsOf = (kind: string, chatId: string) =>
  rows<{ user_id: string; body: string }>(
    `SELECT user_id, body FROM notifications WHERE kind = $1 AND subject_id = $2`,
    [kind, chatId],
  );

/** Marks the latest reply to this number as sent, so a failed receipt can find it. */
async function sentAs(phone: string, wamid: string) {
  await rows(
    `UPDATE outbox SET status = 'sent', provider_message_id = $2, delivery_status = 'sent'
      WHERE id = (SELECT id FROM outbox WHERE recipient = $1 AND template LIKE 'session:%'
                   ORDER BY created_at DESC LIMIT 1)`,
    [phone, wamid],
  );
}

describe('Papers per home: alerts that were missing', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('a location pin alerts the person', async () => {
    const { customer } = await sellProject(admin, { name: 'Pin Sender (test)' });
    await sendInbound(customer.phone, {
      location: { latitude: 18.52, longitude: 73.85, name: 'Our roof (test)' },
    });
    const chat = await chatOf(customer.phone);
    const link = 'https://maps.google.com/?q=18.52,73.85';
    expect((await chatMessages(admin, customer.phone)).map((row) => row.body)).toEqual([
      `📍 Location: Our roof (test) ${link}`,
    ]);
    // Their person is told, with what was sent; the customer is not told "not understood".
    const told = await alertsOf('whatsapp_handover', chat.id);
    expect(told).toHaveLength(1);
    expect(told[0]?.body).toContain(link);
    expect((await lastReply(customer.phone))?.body ?? '').not.toMatch(/did not understand/i);
    // The person holds the chat now: the next pin is just an inbound alert.
    const id = `wamid.acceptance-pin-${customer.phone.slice(1)}`;
    await sendInbound(customer.phone, { id, location: { latitude: 1, longitude: 2 } });
    const heard = await rows(`SELECT id FROM notifications WHERE dedupe_key LIKE $1`, [
      `wa_in:${id}:%`,
    ]);
    expect(heard).toHaveLength(1);
  });

  it('a contact card shows in the chat', async () => {
    const { customer } = await sellProject(admin, { name: 'Card Sender (test)' });
    await sendInbound(customer.phone, {
      contact: { name: 'Ravi Patil (test)', phone: '+919000000102' },
    });
    expect((await chatMessages(admin, customer.phone)).map((row) => row.body)).toEqual([
      '👤 Contact: Ravi Patil (test) +919000000102',
    ]);
    expect(await alertsOf('whatsapp_handover', (await chatOf(customer.phone)).id)).toHaveLength(1);
  });

  it('a failed reply alerts the person', async () => {
    const { customer } = await sellProject(admin, { name: 'Failed Reply (test)' });
    await say(customer.phone, 'hello');
    const chat = await chatOf(customer.phone);
    const wamid = `wamid.failed-${customer.phone.slice(1)}`;
    await sentAs(customer.phone, wamid);
    await sendStatus(wamid, 'failed');
    await sendStatus(wamid, 'failed');
    const told = await alertsOf('whatsapp_send_failed', chat.id);
    expect(told).toHaveLength(1);
    expect(told[0]?.body).toContain(customer.phone);
  });

  it('a number not on WhatsApp gets the SMS and no alert', async () => {
    const { customer } = await sellProject(admin, { name: 'Not On WhatsApp (test)' });
    await say(customer.phone, 'hello');
    const chat = await chatOf(customer.phone);
    const wamid = `wamid.not-on-${customer.phone.slice(1)}`;
    await sentAs(customer.phone, wamid);
    await sendStatus(wamid, 'failed', 131026);
    expect(await alertsOf('whatsapp_send_failed', chat.id)).toHaveLength(0);
    expect(await alertsOf('whatsapp_file_failed', chat.id)).toHaveLength(0);
  });

  it('a Word file is kept as another file and answers no paper request', async () => {
    const { customer, project } = await sellProject(admin, { name: 'Word Sender (test)' });
    const asked = await admin.post<{ id: string }>('/document-requests', {
      projectId: project.id,
      category: 'property',
      title: 'Farm 7/12 extract (test)',
    });
    await sendInbound(customer.phone, {
      media: { type: 'document', fileId: 'word-1', filename: 'Roof plan (test).docx' },
    });
    const [shown] = (await chatMessages(admin, customer.phone)).filter((row) => row.file);
    expect(shown?.file).toMatchObject({ contentType: WORD });
    const kept = await rows<{ content_type: string; category: string }>(
      `SELECT content_type, category FROM documents WHERE customer_id = $1`,
      [customer.customerId],
    );
    expect(kept).toEqual([{ content_type: WORD, category: 'other' }]);
    const [request] = await rows<{ status: string }>(
      'SELECT status::text AS status FROM document_requests WHERE id = $1',
      [asked.id],
    );
    expect(request?.status).toBe('open');
  });

  it('a Word file through the normal upload is refused', async () => {
    const { project } = await sellProject(admin, { name: 'Word Upload (test)' });
    const zip = Buffer.alloc(30 + 17);
    zip.write('PK\x03\x04', 0, 'latin1');
    zip.writeUInt16LE(17, 26);
    zip.write('word/document.xml', 30, 'latin1');
    const form = new FormData();
    form.set('category', 'other');
    form.set('name', 'Plan (test)');
    form.set('projectId', project.id);
    form.set('file', new Blob([new Uint8Array(zip)], { type: WORD }), 'plan.docx');
    const reply = await admin.raw('POST', '/documents', form);
    expect(reply.status).toBe(400);
    expect(reply.text).toMatch(/photo.*PDF/i);
  });
});
