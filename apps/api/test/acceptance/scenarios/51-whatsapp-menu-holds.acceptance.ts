import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { alerts, customerInChat, endsWithTaps, requestsOf } from '../support/menu-chat';
import { chatOf, choices, lastReply, say, tap } from '../support/onboarding';

// The WhatsApp menu audit (3 Nov 2026) and its review: a person's hold survives the bot's
// own flows and their exits; a stale step goes to the person; a thanks is answered warmly.
describe('WhatsApp menu paths in a held chat', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('a rating while a person has the chat is saved, and the person keeps the chat', async () => {
    const sale = await customerInChat(admin, 'Menu Held Rating Customer (test)');
    const { phone, customerId } = sale.customer;
    await rows(`UPDATE projects SET status = 'operational' WHERE id = $1`, [sale.project.id]);
    const chat = await chatOf(phone);
    await admin.post(`/whatsapp/chats/${chat.id}/reply`, { text: 'Hello from the office (test)' });

    await tap(phone, 'feedback');
    expect(choices(await endsWithTaps(phone))).toContain('rate:4');
    await tap(phone, 'rate:4');
    expect(choices(await endsWithTaps(phone))).toEqual(['menu']);
    await say(phone, 'Great team (test)');
    expect((await endsWithTaps(phone))?.body).toContain('noted');
    const saved = await rows<{ rating: number; comment: string | null }>(
      'SELECT rating, comment FROM customer_feedback WHERE customer_id = $1',
      [customerId],
    );
    expect(saved).toEqual([{ rating: 4, comment: 'Great team (test)' }]);

    // M6: Raise a complaint runs as the bot's flow inside the hold, and the hold stays.
    await tap(phone, 'service');
    await say(phone, 'Meter reading looks wrong (test)');
    expect(await requestsOf(customerId)).toHaveLength(1);
    expect((await chatOf(phone)).state).toBe('human');
    expect(await alerts(chat.id, 'whatsapp_message')).toHaveLength(0);
  });

  it('Menu from a complaint inside a hold keeps the person; a stale step goes to them', async () => {
    const sale = await customerInChat(admin, 'Menu Held Exit Customer (test)');
    const { phone, customerId } = sale.customer;
    const chat = await chatOf(phone);
    await admin.post(`/whatsapp/chats/${chat.id}/reply`, { text: 'Hello from the office (test)' });

    // F2: Menu on the prompt ends only the step; the chat stays the person's.
    await tap(phone, 'service');
    await tap(phone, 'menu');
    expect((await lastReply(phone))?.kind).toBe('list');
    expect((await chatOf(phone)).state).toBe('human');

    // F1: a step older than 30 minutes is over; the words go to the person, with an alert.
    await tap(phone, 'service');
    await rows(
      `UPDATE wa_conversations SET context = context || jsonb_build_object('stepAt', 0) WHERE id = $1`,
      [chat.id],
    );
    await say(phone, 'The office said they would call me back (test)');
    expect(await requestsOf(customerId)).toHaveLength(0);
    expect(await alerts(chat.id, 'whatsapp_message')).not.toHaveLength(0);
  });

  it('a thanks after an answer gets a warm word and Menu, and no person (review F7)', async () => {
    const { customer } = await customerInChat(admin, 'Menu Thanks Customer (test)');
    const chat = await chatOf(customer.phone);
    await tap(customer.phone, 'warranty');
    await say(customer.phone, 'Thank you');
    const reply = await endsWithTaps(customer.phone);
    expect(reply?.body).toBe('You’re welcome 🙏');
    expect(choices(reply)).toEqual(['menu']);
    expect((await chatOf(customer.phone)).state).toBe('menu');
    expect(await alerts(chat.id, 'whatsapp_handover')).toHaveLength(0);
  });
});
