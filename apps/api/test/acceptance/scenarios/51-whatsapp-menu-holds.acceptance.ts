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

    // One rating system (redesign §13): the pending rating ask is answered with five taps.
    const [ask] = await rows<{ id: string }>(
      `INSERT INTO customer_actions (type, customer_id, project_id, title, payload)
       VALUES ('rating', $1, $2, 'Rate: survey', $3::jsonb) RETURNING id`,
      [
        customerId,
        sale.project.id,
        JSON.stringify({
          kind: 'stage',
          projectId: sale.project.id,
          stage: 'survey',
          once: `rating:stage:${sale.project.id}:survey`,
        }),
      ],
    );
    await tap(phone, 'feedback');
    expect(choices(await endsWithTaps(phone))).toContain(`rt:${ask?.id}:4`);
    await tap(phone, `rt:${ask?.id}:4`);
    expect((await endsWithTaps(phone))?.body).toContain('Thank you for rating us');
    const saved = await rows<{ rating: number }>(
      'SELECT rating FROM stage_ratings WHERE customer_id = $1',
      [customerId],
    );
    expect(saved).toEqual([{ rating: 4 }]);

    // M6: Report a problem runs as the bot's flow inside the hold, and the hold stays.
    await tap(phone, 'service');
    await tap(phone, 'pb:what:other');
    await tap(phone, 'pb:since:today');
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
    expect(choices(await lastReply(phone))).toContain('go:more');
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

  it('a thanks after an answer gets a short word, no buttons and no person (redesign §14)', async () => {
    const { customer } = await customerInChat(admin, 'Menu Thanks Customer (test)');
    const chat = await chatOf(customer.phone);
    await tap(customer.phone, 'warranty');
    await say(customer.phone, 'Thank you');
    const reply = await lastReply(customer.phone);
    expect(reply?.body).toBe('You’re welcome 🙏');
    expect(reply?.kind).toBe('text');
    expect((await chatOf(customer.phone)).state).toBe('menu');
    expect(await alerts(chat.id, 'whatsapp_handover')).toHaveLength(0);
  });
});
