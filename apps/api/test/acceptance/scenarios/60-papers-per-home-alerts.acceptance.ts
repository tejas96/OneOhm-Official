import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { chatOf, replies, say } from '../support/onboarding';
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

/** The alerts the chat's people got for one inbound message. */
const heardOf = (waMessageId: string) =>
  rows<{ body: string }>('SELECT body FROM notifications WHERE dedupe_key LIKE $1', [
    `wa_in:${waMessageId}:%`,
  ]);

/** Marks the latest reply to this number as sent, so a failed receipt can find it. */
async function sentAs(phone: string, wamid: string) {
  await rows(
    `UPDATE outbox SET status = 'sent', provider_message_id = $2, delivery_status = 'sent'
      WHERE id = (SELECT id FROM outbox WHERE recipient = $1 AND template LIKE 'session:%'
                   ORDER BY created_at DESC LIMIT 1)`,
    [phone, wamid],
  );
}

/** A real (empty) Word file's ZIP: two entries, their central directory and its end record. */
function wordFile(): Buffer {
  const names = ['[Content_Types].xml', 'word/document.xml'];
  const parts = (sig: string, size: number, at: number, name: string, offset: number) => {
    const head = Buffer.alloc(size);
    head.write(sig, 0, 'latin1');
    head.writeUInt16LE(name.length, at);
    if (size === 46) head.writeUInt32LE(offset, 42);
    return Buffer.concat([head, Buffer.from(name)]);
  };
  let offset = 0;
  const local = names.map((name) => {
    const part = parts('PK\x03\x04', 30, 26, name, 0);
    offset += part.length;
    return part;
  });
  let at = 0;
  const central = names.map((name, index) => {
    const part = parts('PK\x01\x02', 46, 28, name, at);
    at += local[index]?.length ?? 0;
    return part;
  });
  const end = Buffer.alloc(22);
  end.write('PK\x05\x06', 0, 'latin1');
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(Buffer.concat(central).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

describe('Papers per home: alerts that were missing', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('a location pin alerts the person and keeps the assistant', async () => {
    const { customer } = await sellProject(admin, { name: 'Pin Sender (test)' });
    const id = `wamid.acceptance-pin-${customer.phone.slice(1)}`;
    const before = (await replies(customer.phone)).length;
    await sendInbound(customer.phone, {
      id,
      location: { latitude: 18.52, longitude: 73.85, name: 'Our roof (test)' },
    });
    const chat = await chatOf(customer.phone);
    const link = 'https://maps.google.com/?q=18.52,73.85';
    expect((await chatMessages(admin, customer.phone)).map((row) => row.body)).toEqual([
      `📍 Location: Our roof (test) ${link}`,
    ]);
    // Their person is told once, with what was sent; the chat is not handed over and the
    // customer is told nothing ("not understood" or "passed to").
    const told = await heardOf(id);
    expect(told).toHaveLength(1);
    expect(told[0]?.body).toContain(link);
    expect(await alertsOf('whatsapp_handover', chat.id)).toHaveLength(0);
    expect(chat.state).not.toBe('human');
    expect(await replies(customer.phone)).toHaveLength(before);
  });

  it('a contact card shows in the chat', async () => {
    const { customer } = await sellProject(admin, { name: 'Card Sender (test)' });
    const id = `wamid.acceptance-card-${customer.phone.slice(1)}`;
    await sendInbound(customer.phone, {
      id,
      contact: { name: 'Ravi Patil (test)', phone: '+919000000102' },
    });
    expect((await chatMessages(admin, customer.phone)).map((row) => row.body)).toEqual([
      '👤 Contact: Ravi Patil (test) +919000000102',
    ]);
    expect(await heardOf(id)).toHaveLength(1);
    expect((await chatOf(customer.phone)).state).not.toBe('human');
  });

  it('a sticker alerts once and gets no reply', async () => {
    const { customer } = await sellProject(admin, { name: 'Sticker Sender (test)' });
    const id = `wamid.acceptance-sticker-${customer.phone.slice(1)}`;
    const before = (await replies(customer.phone)).length;
    await sendInbound(customer.phone, { id, sticker: true });
    expect(await heardOf(id)).toHaveLength(1);
    expect(await replies(customer.phone)).toHaveLength(before);
  });

  it('a reaction is shown in the chat, with no alert and no reply', async () => {
    const { customer } = await sellProject(admin, { name: 'Reaction Sender (test)' });
    const id = `wamid.acceptance-reaction-${customer.phone.slice(1)}`;
    const before = (await replies(customer.phone)).length;
    await sendInbound(customer.phone, { id, reaction: '👍' });
    expect(await heardOf(id)).toHaveLength(0);
    expect(await replies(customer.phone)).toHaveLength(before);
    const [row] = await rows<{ body: string }>(
      'SELECT body FROM wa_messages WHERE wa_message_id = $1',
      [id],
    );
    expect(row?.body).toBe('Reaction 👍');
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
    const zip = wordFile();
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
