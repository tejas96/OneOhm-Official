import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  chatOf,
  choices,
  lastReply,
  leadsOf,
  notesOf,
  replies,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Part 3, task 6: the electricity bill photo (or PDF) is filed on the lead, a file sent
// before the lead exists waits in the chat and is filed when the lead is made, and a file
// never counts as an unclear answer.
interface DocRow {
  id: string;
  lead_id: string | null;
  customer_id: string | null;
  category: string;
  content_type: string;
}

const docsOf = (leadId: string) =>
  rows<DocRow>(
    'SELECT id, lead_id, customer_id, category, content_type FROM documents WHERE lead_id = $1',
    [leadId],
  );
const photo = (phone: string, fileId = 'bill-1') =>
  sendInbound(phone, { media: { type: 'image', fileId, mimeType: 'image/jpeg' } });
const pdf = (phone: string) =>
  sendInbound(phone, {
    media: { type: 'document', fileId: 'bill-pdf', mimeType: 'application/pdf', filename: 'b.pdf' },
  });
const bodies = async (phone: string) => (await replies(phone)).map((reply) => reply.body);

describe('The bill photo on the lead', () => {
  let admin: Session;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune'] });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('holds a photo sent before the lead exists, then files it when the city makes the lead', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await photo(phone);
    const sent = await replies(phone);
    expect(sent.at(-2)?.body).toContain('first get a few details');
    expect(choices(sent.at(-1))).toEqual(['ob:name:yes', 'ob:name:change', 'ob:person']);
    const chat = await chatOf(phone);
    expect(chat.ob?.misses).toBe(0);
    expect(chat.ob).toHaveProperty('pendingFile');

    await tap(phone, 'ob:name:yes');
    await tap(phone, 'ob:city:Pune');
    const [lead] = await leadsOf(phone);
    const [doc, ...more] = await docsOf(lead?.id ?? '');
    expect(more).toEqual([]);
    expect(doc).toMatchObject({ customer_id: null, category: 'electricity_bill' });
    const notes = (await notesOf(lead?.id ?? '')).map((row) => row.note);
    expect(notes).toContain('Bill file received on WhatsApp (not checked)');
    expect((await chatOf(phone)).ob).not.toHaveProperty('pendingFile');

    // The bill is already on the lead, so the photo question is skipped.
    await tap(phone, 'ob:site:home');
    await tap(phone, 'ob:bill:2000_3000');
    await tap(phone, 'ob:roof:rcc');
    await tap(phone, 'ob:floors:1');
    expect((await chatOf(phone)).state).toBe('onboard:done');
    expect(await docsOf(lead?.id ?? '')).toHaveLength(1);
    // Staff can open the stored paper, not only list it.
    const opened = await admin.download(`/documents/${doc?.id}/file`);
    expect(opened.status).toBe(200);
    expect(opened.bytes.length).toBeGreaterThan(0);
  });

  it('answers audio with the existing reply and the same question, with no miss', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await sendInbound(phone, { media: { type: 'audio', fileId: 'voice-1' } });
    const sent = await replies(phone);
    expect(sent.at(-2)?.body).toContain('only take photos and PDF papers');
    expect(choices(sent.at(-1))).toEqual(['ob:name:yes', 'ob:name:change', 'ob:person']);
    expect((await chatOf(phone)).ob?.misses).toBe(0);
  });

  it('files an image at the photo question and the estimate follows', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await tap(phone, 'ob:site:home');
    await tap(phone, 'ob:bill:2000_3000');
    await tap(phone, 'ob:roof:rcc');
    await tap(phone, 'ob:floors:1');
    await photo(phone);
    const [lead] = await leadsOf(phone);
    const [doc] = await docsOf(lead?.id ?? '');
    expect(doc).toMatchObject({
      lead_id: lead?.id,
      customer_id: null,
      category: 'electricity_bill',
    });
    const notes = (await notesOf(lead?.id ?? '')).map((row) => row.note);
    expect(notes).toContain('Bill file received on WhatsApp (not checked)');
    expect((await bodies(phone)).some((body) => body.includes('Thank'))).toBe(true);
    const estimate = (await replies(phone)).find((reply) => reply.filename);
    expect(estimate?.caption).toContain('Estimate');
    expect((await chatOf(phone)).state).toBe('onboard:done');
    expect(lead?.next_action_on).toBe(today());
  });

  it('stores a PDF at the bill question and asks the bill question again', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await tap(phone, 'ob:site:home');
    await pdf(phone);
    const [lead] = await leadsOf(phone);
    const [doc, ...more] = await docsOf(lead?.id ?? '');
    expect(more).toEqual([]);
    expect(doc?.content_type).toBe('application/pdf');
    expect(choices(await lastReply(phone)).some((id) => id.startsWith('ob:bill:'))).toBe(true);
    const chat = await chatOf(phone);
    expect(chat.state).toBe('onboard:bill');
    expect(chat.ob?.misses).toBe(0);
  });

  it('refuses a file over the size cap and stores nothing', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await tap(phone, 'ob:site:home');
    await photo(phone, 'sample-too-large');
    const sent = await replies(phone);
    expect(sent.at(-2)?.body).toContain('too large');
    expect(choices(sent.at(-1)).some((id) => id.startsWith('ob:bill:'))).toBe(true);
    const [lead] = await leadsOf(phone);
    expect(await docsOf(lead?.id ?? '')).toEqual([]);
  });

  it('files nothing for a stranger outside onboarding who has no lead', async () => {
    const off = await withOnboarding(admin, { enabled: false });
    try {
      const phone = uniquePhone();
      await photo(phone);
      expect(await leadsOf(phone)).toEqual([]);
      expect(await rows('SELECT 1 FROM wa_conversations WHERE phone = $1', [phone])).toHaveLength(
        1,
      );
      expect(choices(await lastReply(phone))).toEqual(['callback', 'human']);
    } finally {
      await off();
    }
  });

  it('files a photo from a number whose lead the team made', async () => {
    const phone = uniquePhone();
    const lead = await admin.post<{ id: string }>('/leads', {
      name: 'Team Lead (test)',
      phone,
      city: 'Pune',
      nextActionOn: today(),
    });
    await photo(phone);
    expect(await docsOf(lead.id)).toHaveLength(1);
  });
});
