import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { alerts, customerInChat, endsWithTaps } from '../support/menu-chat';
import {
  chatOf,
  choices,
  handOverAlerts,
  lastReply,
  replies,
  say,
  tap,
} from '../support/onboarding';
import { sendInbound } from '../support/whatsapp';

// Redesign phase 1a (4 Nov 2026), §14: small talk gets a short word and no alert; words we
// do not know get choices, and the second in a row goes to a named person with the words;
// a late tap is said to be earlier, then Home; the language is picked in the chat; a
// customer who wrote while a person had the chat hears when it comes back.
describe('WhatsApp talk (redesign §14)', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('ok, thanks and 👍 get a short word back: no buttons, no alert, no hand-over', async () => {
    const { customer } = await customerInChat(admin, 'Small Talk Customer (test)');
    const { phone } = customer;
    const chat = await chatOf(phone);
    for (const [text, answer] of [
      ['ok', 'Great 👍'],
      ['Thanks!', 'You’re welcome 🙏'],
      ['👍', 'Great 👍'],
      ['Good morning', 'Good morning 🙏'],
    ]) {
      await say(phone, text ?? '');
      const reply = await lastReply(phone);
      expect(reply?.kind, text).toBe('text');
      expect(reply?.body, text).toBe(answer);
    }
    expect((await chatOf(phone)).state).toBe('menu');
    expect(await alerts(chat.id, 'whatsapp_handover')).toHaveLength(0);
    expect(await alerts(chat.id, 'whatsapp_message')).toHaveLength(0);
  });

  it('a waiting step gets the words first: "thanks" is not small talk while we wait', async () => {
    const { customer } = await customerInChat(admin, 'Step First Customer (test)');
    await tap(customer.phone, 'go:refer');
    await say(customer.phone, 'thanks');
    expect((await lastReply(customer.phone))?.body).toContain('10-digit mobile number');
  });

  it('unknown words: sorry and choices; the second in a row goes to the person with the words', async () => {
    const { customer } = await customerInChat(admin, 'Unknown Words Customer (test)');
    const { phone } = customer;
    const chat = await chatOf(phone);
    await say(phone, 'Is the price the same as last week? (test)');
    const sorry = await endsWithTaps(phone);
    expect(sorry?.body).toBe('Sorry, we didn’t get that. Pick one below.');
    expect(choices(sorry)).toEqual(['go:talk', 'go:update', 'go:more']);
    expect(sorry?.buttons?.[0]?.title).toMatch(/^Talk to /);
    expect(await handOverAlerts(chat.id)).toHaveLength(0);

    await say(phone, 'Can you fit a water heater too? (test)');
    const handed = await endsWithTaps(phone);
    expect(handed?.body).toMatch(
      /^Sorry, we still didn’t get that\. We’ve passed your message to .+, who will reply here/,
    );
    expect(choices(handed)).toEqual(['menu']);
    expect((await chatOf(phone)).state).toBe('human');
    const [alert] = await handOverAlerts(chat.id);
    expect(alert?.body).toContain('They wrote: "Can you fit a water heater too? (test)"');
  });

  it('an unknown word, then a tap, then an unknown word is not "twice in a row"', async () => {
    const { customer } = await customerInChat(admin, 'Not In A Row Customer (test)');
    const { phone } = customer;
    await say(phone, 'Is the price the same as last week? (test)');
    await tap(phone, 'go:warranty');
    await say(phone, 'Can you fit a water heater too? (test)');
    expect((await lastReply(phone))?.body).toBe('Sorry, we didn’t get that. Pick one below.');
    expect((await chatOf(phone)).state).toBe('menu');
  });

  it('a late tap is said to be earlier, then Home; Meta’s repeat of it changes nothing', async () => {
    const { customer } = await customerInChat(admin, 'Late Tap Customer (test)');
    const { phone } = customer;
    await say(phone, 'payments');
    const before = (await replies(phone)).length;
    const id = `wamid.late-${Date.now()}`;
    await sendInbound(phone, {
      buttonReply: 'go:documents',
      id,
      at: new Date(Date.now() - 60_000),
    });
    const [earlier, home] = (await replies(phone)).slice(before);
    expect(earlier?.body).toBe('That was an earlier message — here is the latest.');
    expect(choices(home)).toContain('go:more');
    await sendInbound(phone, {
      buttonReply: 'go:documents',
      id,
      at: new Date(Date.now() - 60_000),
    });
    expect((await replies(phone)).length).toBe(before + 2);
  });

  it('More → Language → हिंदी saves the language and answers in it at once', async () => {
    const { customer } = await customerInChat(admin, 'Language Customer (test)');
    const { phone, customerId } = customer;
    await tap(phone, 'go:language');
    expect(choices(await lastReply(phone))).toEqual(['lang:en', 'lang:mr', 'lang:hi']);
    await tap(phone, 'lang:hi');
    const [saved, home] = (await replies(phone)).slice(-2);
    expect(saved?.body).toBe('ठीक है ✅ अब हम हिंदी में लिखेंगे.');
    expect(home?.body).toMatch(/^नमस्ते Language 👋/);
    const [row] = await rows<{ language: string }>(
      'SELECT preferred_language AS language FROM customers WHERE id = $1',
      [customerId],
    );
    expect(row?.language).toBe('hi-IN');
    expect((await chatOf(phone)).language).toBe('hi');
  });

  it('Marathi typed while English is set switches to Marathi', async () => {
    const { customer } = await customerInChat(admin, 'Typed Marathi Customer (test)');
    await say(customer.phone, 'माझे पेमेंट किती बाकी आहे?');
    expect((await lastReply(customer.phone))?.body).toContain('🔴');
    expect((await lastReply(customer.phone))?.body).toContain('भरायचे');
    expect((await chatOf(customer.phone)).language).toBe('mr');
  });

  it('hand-back: a customer who wrote while held hears their person is away', async () => {
    const { customer } = await customerInChat(admin, 'Hand Back Told Customer (test)');
    const { phone } = customer;
    const chat = await chatOf(phone);
    await admin.post(`/whatsapp/chats/${chat.id}/reply`, { text: 'Hello from the office (test)' });
    await say(phone, 'I will send the bill tonight (test)');
    const before = (await replies(phone)).length;
    await admin.post(`/whatsapp/chats/${chat.id}/release`);
    const told = await lastReply(phone);
    expect((await replies(phone)).length).toBe(before + 1);
    expect(told?.body).toMatch(/ is away now — we’re here to help\.$/);
    expect(choices(told)).toEqual(['menu']);
    expect((await chatOf(phone)).state).toBe('menu');
  });

  it('hand-back by the Menu tap: told first (if they wrote), then Home', async () => {
    const { customer } = await customerInChat(admin, 'Menu Back Told Customer (test)');
    const { phone } = customer;
    await tap(phone, 'go:talk');
    await say(phone, 'Please call me after 5 (test)');
    await tap(phone, 'menu');
    const [told, home] = (await replies(phone)).slice(-2);
    expect(told?.body).toMatch(/ is away now — we’re here to help\.$/);
    expect(told?.kind).toBe('text');
    expect(choices(home)).toContain('go:more');
  });
});
