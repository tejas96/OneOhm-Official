import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import { customerInChat } from '../support/menu-chat';
import { chatOf, choices, lastReply, replies, say, tap } from '../support/onboarding';
import { uniquePhone } from '../support/sales';

// Redesign §14, language: More → Language saves the holder's language (as the app does)
// and the chat's; a family member's pick stays on their own chat; a change in the app or
// by staff reaches the holder's WhatsApp at once; Devanagari typed while English is set.
const languageOf = async (customerId: string) =>
  (
    await rows<{ language: string }>(
      'SELECT preferred_language AS language FROM customers WHERE id = $1',
      [customerId],
    )
  )[0]?.language;

const languageAudits = (customerId: string) =>
  rows<{ data: { via?: string } | null }>(
    `SELECT data FROM audit_log WHERE action = 'customer.language_changed' AND entity_id = $1`,
    [customerId],
  );

describe('WhatsApp language (redesign §14)', () => {
  let admin: Session;

  beforeAll(async () => {
    admin = await Session.admin();
  });
  afterAll(closeDb);

  it('More → Language → हिंदी saves the language and answers in it at once', async () => {
    const { customer } = await customerInChat(admin, 'Language Customer (test)');
    const { phone, customerId } = customer;
    await tap(phone, 'go:language');
    expect(choices(await lastReply(phone))).toEqual(['lang:en', 'lang:mr', 'lang:hi']);
    await tap(phone, 'lang:hi');
    const [saved, home] = (await replies(phone)).slice(-2);
    expect(saved?.body).toBe('ठीक है ✅ अब हम हिंदी में लिखेंगे।');
    expect(home?.body).toMatch(/^नमस्ते Language 👋/);
    expect(await languageOf(customerId)).toBe('hi-IN');
    expect((await chatOf(phone)).language).toBe('hi');
    const audits = await languageAudits(customerId);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.data?.via).toBe('whatsapp');

    // Staff set Marathi on the customer page: the holder's next "hi" is in Marathi (I1).
    await admin.put(`/customers/${customerId}/language`, { language: 'mr-IN' });
    expect((await chatOf(phone)).language).toBe('mr');
    await say(phone, 'hi');
    expect((await lastReply(phone))?.body).toMatch(/^नमस्कार Language 👋/);
  });

  it('a family member’s pick stays on their chat; the holder’s language is unchanged', async () => {
    const { customer } = await customerInChat(admin, 'Family Language Customer (test)');
    const family = uniquePhone();
    await rows(
      `insert into customer_contacts (customer_id, name, phone_e164, relation) values ($1, 'Family (test)', $2, 'son')`,
      [customer.customerId, family],
    );
    await say(family, 'hi');
    await tap(family, 'go:language');
    await tap(family, 'lang:mr');
    expect((await chatOf(family)).language).toBe('mr');
    expect(await languageOf(customer.customerId)).toBe('en-IN');
    expect(await languageAudits(customer.customerId)).toHaveLength(0);
    // The family chat stays in Marathi; the holder's own chat stays in English.
    await say(family, 'hi');
    expect((await lastReply(family))?.body).toMatch(/^नमस्कार /);
    await say(customer.phone, 'hi');
    expect((await lastReply(customer.phone))?.body).toMatch(/^Hi Family 👋/);
  });

  it('Marathi typed while English is set switches to Marathi', async () => {
    const { customer } = await customerInChat(admin, 'Typed Marathi Customer (test)');
    await say(customer.phone, 'माझे पेमेंट किती बाकी आहे?');
    expect((await lastReply(customer.phone))?.body).toContain('🔴');
    expect((await lastReply(customer.phone))?.body).toContain('भरायचे');
    expect((await chatOf(customer.phone)).language).toBe('mr');
  });
});
