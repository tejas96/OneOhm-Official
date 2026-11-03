import type { LeadDetail } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { chatOf, say } from '../support/onboarding';
import { today, uniquePhone } from '../support/sales';

// Live review B9/B11: "Contacted" means a person got in touch, and the chat panel shows
// the newest messages, oldest of those first.
describe('Honest funnel and chat panel', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  const newLead = (name: string, phone = uniquePhone()) =>
    admin.post<{ id: string }>('/leads', {
      name,
      phone,
      city: 'Sangli',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });

  it.each(['call', 'visit', 'whatsapp'] as const)(
    'the first %s a person logs moves a new lead to Contacted, once',
    async (kind) => {
      const lead = await newLead(`First ${kind} (test)`);
      await admin.post(`/leads/${lead.id}/activities`, { kind: 'note', note: 'Just a note' });
      expect((await admin.get<LeadDetail>(`/leads/${lead.id}`)).stage).toBe('new');
      await admin.post(`/leads/${lead.id}/activities`, { kind, note: 'Spoke (test)' });
      const detail = await admin.get<LeadDetail>(`/leads/${lead.id}`);
      expect(detail.stage).toBe('contacted');
      expect(detail.activities.map((row) => row.note).join('\n')).toContain(
        'Moved from New to Contacted.',
      );
      await admin.post(`/leads/${lead.id}/activities`, { kind, note: 'Again (test)' });
      const moves = (await admin.get<LeadDetail>(`/leads/${lead.id}`)).activities.filter((row) =>
        row.note.includes('Moved from'),
      );
      expect(moves).toHaveLength(1);
    },
  );

  it("the first staff WhatsApp reply in the lead's chat moves it to Contacted", async () => {
    const phone = uniquePhone();
    const lead = await newLead('Chat Reply Lead (test)', phone);
    await say(phone, 'hi');
    const chat = await chatOf(phone);
    expect((await admin.get<LeadDetail>(`/leads/${lead.id}`)).stage).toBe('new');
    await admin.post(`/whatsapp/chats/${chat.id}/reply`, { text: 'Hello from the office (test)' });
    expect((await admin.get<LeadDetail>(`/leads/${lead.id}`)).stage).toBe('contacted');
  });

  it('the chat panel returns the newest 200 messages, oldest of those first', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    const chat = await chatOf(phone);
    await rows(
      `INSERT INTO wa_messages (conversation_id, direction, kind, body, created_at)
       SELECT $1, 'in', 'text', 'msg ' || i, now() + (i || ' seconds')::interval
         FROM generate_series(1, 260) AS i`,
      [chat.id],
    );
    const detail = await admin.get<{ messages: { body: string; at: string }[] }>(
      `/whatsapp/chats/${chat.id}`,
    );
    expect(detail.messages).toHaveLength(200);
    expect(detail.messages.at(-1)?.body).toBe('msg 260');
    expect(detail.messages[0]?.body).toBe('msg 61');
    const times = detail.messages.map((message) => message.at);
    expect(times).toEqual([...times].sort());
  });
});
