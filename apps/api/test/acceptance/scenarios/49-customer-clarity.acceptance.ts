import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, rows } from '../support/db';
import { Session } from '../support/http';
import {
  chatOf,
  choices,
  handOverAlerts,
  lastReply,
  leadsOf,
  replies,
  say,
  tap,
  upToSite,
  withOnboarding,
} from '../support/onboarding';
import { newCustomer, sellProject, today, uniquePhone } from '../support/sales';
import { sendInbound } from '../support/whatsapp';

// Live review C5, C10–C14: what a homeowner sees on WhatsApp. The bot welcomes them by
// name of the company, every list after the first question has a Back row, a voice note
// goes warmly to a person, a file is "received" (never "your bill"), and a customer
// moves around by taps or plain Marathi words, never special English words.
describe('Customer clarity on WhatsApp', () => {
  let admin: Session;
  let restore: () => Promise<void>;

  beforeAll(async () => {
    admin = await Session.admin();
    restore = await withOnboarding(admin, { enabled: true, serviceCities: ['Pune', 'Satara'] });
  });
  afterAll(async () => {
    await restore();
    await closeDb();
  });

  it('C10, C14: the welcome, then a Back row that goes back one question', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    const welcome = await lastReply(phone);
    expect(welcome?.body.split('\n')[0]).toBe('Welcome to OneOhm Solar 🙏');
    expect(choices(welcome)).toEqual(['ob:language:en', 'ob:language:mr', 'ob:language:hi']);
    await tap(phone, 'ob:language:mr');
    await tap(phone, 'ob:name:yes');
    const cities = await lastReply(phone);
    expect(choices(cities).slice(-2)).toEqual(['ob:city:back', 'ob:person']);
    expect(cities?.rows?.at(-2)?.title).toBe('मागे');
    await tap(phone, 'ob:city:Pune');
    expect(choices(await lastReply(phone))).toContain('ob:site:back');
    await tap(phone, 'ob:site:back');
    expect((await chatOf(phone)).state).toBe('onboard:city');
    expect(choices(await lastReply(phone))).toContain('ob:city:Pune');
  });

  it('C11: a file is "received — our team will check it", never "your bill"', async () => {
    const phone = uniquePhone();
    await upToSite(phone);
    await sendInbound(phone, {
      media: {
        type: 'document',
        fileId: 'layout-1',
        mimeType: 'application/pdf',
        filename: 'x.pdf',
      },
    });
    const said = (
      await rows<{ body: string }>(
        `SELECT payload->>'body' AS body FROM outbox WHERE recipient = $1 AND template = 'session:text'
        ORDER BY created_at DESC LIMIT 1`,
        [phone],
      )
    )[0]?.body;
    expect(said).toBe('Thank you. File received — our team will check it.');
  });

  it('C12: a voice note during onboarding goes warmly to a person, with a lead', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await sendInbound(phone, {
      media: { type: 'audio', fileId: 'voice-1', mimeType: 'audio/ogg' },
    });
    const chat = await chatOf(phone);
    expect(chat.state).toBe('human');
    expect((await lastReply(phone))?.body).toContain('Thank you for the voice note.');
    expect(await leadsOf(phone)).toHaveLength(1);
    const alerts = await handOverAlerts(chat.id);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]?.body).toContain('Sent a voice note');
  });

  it('C5: a customer types Marathi words and every answer ends with taps', async () => {
    const { customer } = await sellProject(admin, { name: 'tejas clarity (test)' });
    // "मेनू" is Marathi and Hindi alike: answered (Home), then asked once which (§14).
    await sendInbound(customer.phone, { text: 'मेनू' });
    const [first, ask] = (await replies(customer.phone)).slice(-2);
    expect(choices(first)).toContain('go:more');
    expect(choices(ask)).toEqual(['lang:en', 'lang:mr', 'lang:hi']);
    await sendInbound(customer.phone, { buttonReply: 'lang:mr' });
    const home = await lastReply(customer.phone);
    expect(home?.body).toContain('Tejas');
    expect(home?.body).toContain('नमस्कार');
    expect(choices(home)).toContain('go:more');
    await sendInbound(customer.phone, { text: 'कागद' });
    // The only paper (the quote) goes as the file with its caption (redesign §11).
    expect((await lastReply(customer.phone))?.kind).toBe('document');
    await sendInbound(customer.phone, { buttonReply: 'progress' });
    expect(choices(await lastReply(customer.phone))).toEqual(['go:payments', 'menu']);
    await sendInbound(customer.phone, { buttonReply: 'menu' });
    expect(choices(await lastReply(customer.phone))).toContain('go:more');
  });

  // Fix round 1: with no project yet, Pay and Project update would lead nowhere.
  it('C5: a customer with no project gets only Talk to and Menu', async () => {
    const customer = await newCustomer(admin, { name: 'No Project Clarity (test)' });
    for (const text of ['progress', 'payments']) {
      await sendInbound(customer.phone, { text });
      expect(choices(await lastReply(customer.phone)), text).toEqual(['go:talk', 'menu']);
    }
  });

  it('a customer with no project who says hi gets a call task, once a day (redesign §3)', async () => {
    const customer = await newCustomer(admin, { name: 'No Project Call (test)' });
    await sendInbound(customer.phone, { text: 'hi' });
    await sendInbound(customer.phone, { text: 'hello' });
    const calls = await rows<{ status: string }>(
      `SELECT status::text AS status FROM customer_actions
        WHERE customer_id = $1 AND type = 'callback' AND payload->>'reason' = 'no_project'`,
      [customer.customerId],
    );
    expect(calls).toEqual([{ status: 'received' }]);
  });

  it('C12: a voice note or a video from a team-made lead goes warmly to their person', async () => {
    const phone = uniquePhone();
    await admin.post('/leads', {
      name: 'Team Lead Voice (test)',
      phone,
      city: 'Pune',
      subsidyCategory: 'individual',
      nextActionOn: today(),
    });
    await sendInbound(phone, {
      media: { type: 'video', fileId: 'video-1', mimeType: 'video/mp4' },
    });
    expect((await chatOf(phone)).state).toBe('human');
    expect((await lastReply(phone))?.body).toMatch(/^Thank you for the video\. .+ will watch it/);
    const alerts = await handOverAlerts((await chatOf(phone)).id);
    expect(alerts[0]?.body).toContain('Sent a video');
  });

  it('C14: Back from typing a city goes back to the city list', async () => {
    const phone = uniquePhone();
    await say(phone, 'hi');
    await tap(phone, 'ob:language:en');
    await tap(phone, 'ob:name:yes');
    await tap(phone, 'ob:city:other');
    // The typed-city question also offers the 📍 pin (redesign §16).
    expect(choices(await lastReply(phone))).toEqual(['ob:city:pin', 'ob:city:back', 'ob:person']);
    await sendInbound(phone, { buttonReply: 'ob:city:back' });
    expect(choices(await lastReply(phone))).toContain('ob:city:Pune');
    expect((await chatOf(phone)).state).toBe('onboard:city');
  });
});
